#!/usr/bin/env python3
"""
Generate mock product-feed catalogs for 5 overlapping merchants.

Output (per merchant, under mock-catalog/<slug>/):
  - products.csv       Google Merchant / Stripe Agentic Commerce style feed (150 rows)
  - manifest.json      Stripe-style manifest (stripe_profile_id + files[])

Also writes:
  - mock-catalog/image-spec.json   One entry per image to generate (3 per
                                   merchant x sub-category = 150), each with a
                                   deterministic filename + a generation prompt.

The catalogs deliberately OVERLAP (multiple merchants sell water bottles,
backpacks, earbuds, candles, etc.) so a single shopping query returns products
from several merchants.

Deterministic: seeded RNG so re-running produces identical output.
"""
from __future__ import annotations

import csv
import json
import os
import random
from datetime import datetime, timezone

SEED = 20260720
random.seed(SEED)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "mock-catalog")
IMAGE_WEB_BASE = "/mock-catalog/images"  # served from public/ in the app
PRODUCTS_PER_MERCHANT = 150
IMAGES_PER_SUBCAT = 3
CURRENCY = "USD"

CSV_COLUMNS = [
    "id",
    "title",
    "description",
    "link",
    "image_link",
    "additional_image_link",
    "availability",
    "price",
    "sale_price",
    "brand",
    "gtin",
    "mpn",
    "condition",
    "google_product_category",
    "product_type",
    "item_group_id",
    "color",
    "size",
    "material",
    "quantity",
]

COLORS = [
    "Black", "White", "Navy", "Slate Gray", "Forest Green", "Sand", "Charcoal",
    "Sky Blue", "Burgundy", "Olive", "Blush Pink", "Cream", "Terracotta",
]

# Colors used to vary the 3 generated images within a sub-category.
IMAGE_COLORS = [
    "black", "white", "sand beige", "forest green", "navy", "terracotta",
    "slate gray", "cream", "olive", "blush pink",
]

# Composition / camera direction rotated across a sub-category's 3 variants so
# they read as different catalog shots rather than duplicates.
COMPOSITIONS = [
    "centered straight-on hero shot, seamless studio backdrop, even softbox lighting",
    "dynamic three-quarter angle, gentle top-down perspective, directional light with soft gradient shadow",
    "tight macro detail shot, shallow depth of field, dramatic rim lighting highlighting texture",
]


# ---------------------------------------------------------------------------
# Sub-category definitions. `noun` values combine with adjectives to make names.
# `overlap` marks categories intentionally shared across merchants.
# ---------------------------------------------------------------------------
def subcat(slug, name, gcat, ptype, price, nouns, materials=None,
           has_color=True, sized=False, overlap=False, theme=""):
    return {
        "slug": slug, "name": name, "google_product_category": gcat,
        "product_type": ptype, "price": price, "nouns": nouns,
        "materials": materials or ["Standard"], "has_color": has_color,
        "sized": sized, "overlap": overlap, "theme": theme,
    }


ADJECTIVES = [
    "Classic", "Everyday", "Premium", "Signature", "Essential", "Modern",
    "Heritage", "Studio", "Trail", "Urban", "Alpine", "Coastal", "Luxe",
    "Featherlight", "Rugged", "Minimalist", "Pro", "Aero", "Terra", "Nova",
]

SIZES = ["XS", "S", "M", "L", "XL", "XXL"]

MERCHANTS = [
    {
        "slug": "northwind-apparel",
        "name": "Northwind Apparel",
        "profile_id": "profile_northwind_apparel",
        "brands": ["Northwind", "Northwind Studio", "NW Active"],
        "style": "premium minimalist apparel brand aesthetic, soft diffused daylight, warm neutral linen and stone surfaces, muted earthy palette, elevated editorial catalog styling",
        "subcats": [
            subcat("tshirts", "T-Shirts & Tops", "Apparel & Accessories > Clothing > Shirts & Tops", "Apparel > Tops > T-Shirts", (18, 42), ["Crew Tee", "V-Neck Tee", "Pocket Tee", "Long-Sleeve Tee", "Henley"], ["Organic Cotton", "Cotton Blend", "Linen"], sized=True, theme="wardrobe basics"),
            subcat("hoodies", "Hoodies & Sweatshirts", "Apparel & Accessories > Clothing > Outerwear", "Apparel > Tops > Hoodies", (48, 98), ["Pullover Hoodie", "Zip Hoodie", "Crewneck Sweatshirt", "Fleece Hoodie"], ["French Terry", "Brushed Fleece", "Cotton Blend"], sized=True, theme="cozy streetwear"),
            subcat("activewear", "Activewear", "Apparel & Accessories > Clothing > Activewear", "Apparel > Activewear", (32, 88), ["Training Shorts", "Jogger Pants", "Performance Tee", "Track Jacket"], ["Recycled Poly", "Moisture-Wick Knit"], sized=True, overlap=True, theme="athleisure"),
            subcat("hats", "Hats & Caps", "Apparel & Accessories > Clothing Accessories > Hats", "Accessories > Hats", (18, 38), ["Dad Cap", "Trucker Hat", "Beanie", "Bucket Hat"], ["Cotton Twill", "Knit"], theme="everyday headwear"),
            subcat("sunglasses", "Sunglasses", "Apparel & Accessories > Clothing Accessories > Sunglasses", "Accessories > Eyewear > Sunglasses", (45, 145), ["Wayfarer Sunglasses", "Aviator Sunglasses", "Round Sunglasses", "Sport Sunglasses"], ["Acetate", "Recycled Frame"], has_color=True, overlap=True, theme="lifestyle eyewear"),
            subcat("backpacks", "Backpacks & Bags", "Luggage & Bags > Backpacks", "Bags > Backpacks", (58, 168), ["Daypack", "Rolltop Backpack", "Tote Bag", "Weekender Duffel"], ["Recycled Nylon", "Waxed Canvas"], overlap=True, theme="commuter bags"),
            subcat("bottles", "Water Bottles", "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Water Bottles", "Drinkware > Water Bottles", (22, 48), ["Insulated Bottle", "Steel Water Bottle", "Flip-Top Bottle"], ["Stainless Steel", "Tritan"], overlap=True, theme="branded hydration"),
            subcat("socks", "Socks & Accessories", "Apparel & Accessories > Clothing > Underwear & Socks > Socks", "Accessories > Socks", (12, 28), ["Crew Socks 3-Pack", "Ankle Socks 3-Pack", "Wool Socks", "No-Show Socks"], ["Merino Wool", "Combed Cotton"], theme="everyday accessories"),
            subcat("jackets", "Jackets", "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets", "Apparel > Outerwear > Jackets", (88, 248), ["Windbreaker", "Denim Jacket", "Puffer Jacket", "Rain Shell"], ["Recycled Poly", "Denim", "Ripstop"], sized=True, theme="seasonal outerwear"),
            subcat("wallets", "Belts & Wallets", "Apparel & Accessories > Clothing Accessories", "Accessories > Small Leather Goods", (24, 78), ["Bifold Wallet", "Card Holder", "Leather Belt", "Travel Wallet"], ["Full-Grain Leather", "Vegan Leather"], theme="leather goods"),
        ],
    },
    {
        "slug": "harbor-and-home",
        "name": "Harbor & Home",
        "profile_id": "profile_harbor_and_home",
        "brands": ["Harbor & Home", "Harbor Living", "Hearthstone"],
        "style": "warm cozy home-goods brand aesthetic, soft window light, styled on light oak and marble surfaces with linen and greenery accents, hygge editorial mood, creamy natural palette",
        "subcats": [
            subcat("candles", "Candles", "Home & Garden > Decor > Home Fragrances > Candles", "Home > Fragrance > Candles", (18, 52), ["Soy Candle", "3-Wick Candle", "Travel Tin Candle", "Wood-Wick Candle"], ["Soy Wax", "Coconut Wax"], has_color=False, overlap=True, theme="scented home fragrance"),
            subcat("mugs", "Mugs & Drinkware", "Home & Garden > Kitchen & Dining > Tableware > Drinkware", "Drinkware > Mugs", (14, 44), ["Ceramic Mug", "Stoneware Mug Set", "Espresso Cup Set", "Enamel Mug"], ["Stoneware", "Ceramic"], overlap=True, theme="handmade drinkware"),
            subcat("cookware", "Cookware", "Home & Garden > Kitchen & Dining > Cookware", "Kitchen > Cookware", (38, 188), ["Nonstick Skillet", "Dutch Oven", "Saucepan", "Cast Iron Pan"], ["Cast Iron", "Anodized Aluminum"], has_color=True, theme="kitchen cookware"),
            subcat("bedding", "Bedding & Throws", "Home & Garden > Linens & Bedding > Bedding", "Home > Bedding", (48, 198), ["Linen Duvet Cover", "Waffle Throw Blanket", "Cotton Sheet Set", "Knit Throw"], ["French Linen", "Organic Cotton"], sized=True, theme="soft bedding textiles"),
            subcat("loungewear", "Loungewear", "Apparel & Accessories > Clothing > Sleepwear & Loungewear", "Apparel > Loungewear", (32, 96), ["Waffle Robe", "Lounge Pants", "Knit Cardigan", "Slipper Socks"], ["Waffle Knit", "Brushed Cotton"], sized=True, overlap=True, theme="cozy loungewear"),
            subcat("wellness", "Wellness", "Health & Beauty > Health Care", "Wellness > Aromatherapy", (24, 88), ["Essential Oil Diffuser", "Aromatherapy Set", "Yoga Mat", "Meditation Cushion"], ["Bamboo", "Cork"], has_color=True, overlap=True, theme="home wellness"),
            subcat("tumblers", "Tumblers & Bottles", "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Water Bottles", "Drinkware > Tumblers", (22, 46), ["Insulated Tumbler", "Travel Mug", "Glass Water Bottle"], ["Stainless Steel", "Borosilicate Glass"], overlap=True, theme="insulated drinkware"),
            subcat("kitchentools", "Kitchen Tools", "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils", "Kitchen > Tools", (12, 68), ["Utensil Set", "Cutting Board", "Knife Block Set", "Measuring Cups"], ["Acacia Wood", "Stainless Steel"], has_color=False, theme="kitchen essentials"),
            subcat("storage", "Storage & Organization", "Home & Garden > Household Supplies > Storage & Organization", "Home > Storage", (16, 74), ["Woven Basket", "Storage Bin Set", "Glass Jar Set", "Shelf Organizer"], ["Seagrass", "Bamboo"], has_color=True, theme="home organization"),
            subcat("linens", "Table Linens", "Home & Garden > Linens & Bedding > Table Linens", "Home > Table Linens", (14, 58), ["Linen Napkin Set", "Table Runner", "Cotton Placemats", "Tea Towel Set"], ["French Linen", "Cotton"], theme="dining textiles"),
        ],
    },
    {
        "slug": "voltedge-electronics",
        "name": "VoltEdge Electronics",
        "profile_id": "profile_voltedge_electronics",
        "brands": ["VoltEdge", "VoltEdge Pro", "Edge Audio"],
        "style": "sleek premium consumer-tech brand aesthetic, dark charcoal gradient backdrop with cool cyan accent lighting, glossy reflective surface, crisp high-contrast studio lighting, futuristic flagship-product mood",
        "subcats": [
            subcat("earbuds", "Wireless Earbuds", "Electronics > Audio > Audio Components > Headphones", "Audio > Earbuds", (49, 199), ["Wireless Earbuds", "Noise-Cancelling Earbuds", "Open-Ear Buds", "Sport Earbuds"], ["Matte Polymer"], overlap=True, theme="true wireless audio"),
            subcat("headphones", "Headphones", "Electronics > Audio > Audio Components > Headphones", "Audio > Headphones", (79, 349), ["Over-Ear Headphones", "Studio Headphones", "ANC Headphones"], ["Aluminum & Leather"], overlap=True, theme="over-ear audio"),
            subcat("smartwatches", "Smartwatches & Trackers", "Electronics > Communications > Telephony > Mobile Phone Accessories > Smart Watches", "Wearables > Smartwatches", (99, 399), ["Smartwatch", "Fitness Tracker", "GPS Sport Watch"], ["Aluminum", "Titanium"], overlap=True, theme="wearable tech"),
            subcat("speakers", "Portable Speakers", "Electronics > Audio > Audio Players & Recorders", "Audio > Speakers", (39, 249), ["Bluetooth Speaker", "Waterproof Speaker", "Mini Speaker", "Party Speaker"], ["Rugged Fabric"], theme="portable audio"),
            subcat("phoneacc", "Phone Accessories", "Electronics > Communications > Telephony > Mobile Phone Accessories", "Accessories > Phone", (14, 79), ["Phone Case", "MagSafe Charger", "Screen Protector 2-Pack", "Car Mount"], ["Silicone", "Aramid Fiber"], overlap=True, theme="phone accessories"),
            subcat("techbags", "Tech Backpacks", "Luggage & Bags > Backpacks", "Bags > Tech Backpacks", (69, 189), ["Laptop Backpack", "Anti-Theft Backpack", "Commuter Pack", "Sling Bag"], ["Ballistic Nylon"], overlap=True, theme="laptop bags"),
            subcat("powerbanks", "Power Banks", "Electronics > Electronics Accessories > Power > Batteries", "Power > Power Banks", (24, 99), ["10K Power Bank", "20K Power Bank", "MagSafe Power Bank", "Solar Power Bank"], ["Aluminum"], theme="portable power"),
            subcat("keyboards", "Keyboards & Mice", "Electronics > Computers > Computer Accessories", "Computer > Input Devices", (29, 149), ["Mechanical Keyboard", "Wireless Mouse", "Keyboard & Mouse Combo", "Numpad"], ["Aluminum & ABS"], theme="desk peripherals"),
            subcat("streaming", "Webcams & Streaming", "Electronics > Video > Webcams", "Computer > Webcams", (39, 179), ["1080p Webcam", "4K Webcam", "Ring Light", "USB Microphone"], ["Composite"], has_color=False, theme="streaming gear"),
            subcat("cables", "Cables & Adapters", "Electronics > Electronics Accessories > Cables", "Accessories > Cables", (9, 39), ["USB-C Cable 3-Pack", "HDMI Cable", "USB-C Hub", "Charging Dock"], ["Braided Nylon"], theme="connectivity"),
        ],
    },
    {
        "slug": "lumen-beauty",
        "name": "Lumen Beauty",
        "profile_id": "profile_lumen_beauty",
        "brands": ["Lumen", "Lumen Skin", "Lumen Ritual"],
        "style": "elegant clean-beauty brand aesthetic, soft blush and cream pastel backdrop, dewy luminous highlights, delicate florals and water droplets, glossy reflective base, refined luxury-skincare mood",
        "subcats": [
            subcat("skincare", "Skincare", "Health & Beauty > Personal Care > Cosmetics > Skin Care", "Beauty > Skincare", (18, 92), ["Vitamin C Serum", "Hydrating Moisturizer", "Retinol Night Cream", "Gentle Cleanser", "Eye Cream"], ["Formula"], has_color=False, theme="glass-bottle skincare"),
            subcat("sunscreen", "Sunscreen", "Health & Beauty > Personal Care > Cosmetics > Skin Care > Sunscreen", "Beauty > Sunscreen", (16, 44), ["SPF 50 Daily Fluid", "Mineral Sunscreen", "Tinted SPF Cream", "Sport Sunscreen Stick"], ["Formula"], has_color=False, overlap=True, theme="sun care"),
            subcat("candles", "Candles & Aromatherapy", "Home & Garden > Decor > Home Fragrances > Candles", "Home > Fragrance > Candles", (22, 58), ["Scented Candle", "Massage Candle", "Reed Diffuser", "Aromatherapy Candle"], ["Soy Wax"], has_color=False, overlap=True, theme="luxury fragrance"),
            subcat("haircare", "Hair Care & Accessories", "Health & Beauty > Personal Care > Hair Care", "Beauty > Hair", (14, 68), ["Repair Shampoo", "Conditioner", "Silk Scrunchie Set", "Hair Oil", "Wide-Tooth Comb"], ["Formula", "Silk"], has_color=True, theme="hair care"),
            subcat("bath", "Bath & Body", "Health & Beauty > Personal Care > Bath & Body", "Beauty > Bath & Body", (12, 54), ["Body Wash", "Whipped Body Butter", "Bath Salts", "Exfoliating Scrub"], ["Formula"], has_color=False, theme="bath and body"),
            subcat("makeup", "Makeup", "Health & Beauty > Personal Care > Cosmetics > Makeup", "Beauty > Makeup", (14, 62), ["Tinted Lip Balm", "Cream Blush", "Mascara", "Liquid Foundation", "Brow Gel"], ["Formula"], has_color=True, theme="clean makeup"),
            subcat("wellness", "Wellness", "Health & Beauty > Health Care > Vitamins & Supplements", "Wellness > Supplements", (16, 72), ["Collagen Powder", "Beauty Sleep Tea", "Hair Gummies", "Magnesium Drink Mix"], ["Blend"], has_color=False, overlap=True, theme="beauty wellness"),
            subcat("fragrance", "Fragrance", "Health & Beauty > Personal Care > Cosmetics > Perfume & Cologne", "Beauty > Fragrance", (38, 128), ["Eau de Parfum", "Rollerball Perfume", "Solid Perfume", "Body Mist"], ["Formula"], has_color=False, theme="perfume"),
            subcat("tools", "Beauty Tools", "Health & Beauty > Personal Care > Cosmetics > Cosmetic Tools", "Beauty > Tools", (12, 58), ["Jade Roller", "Gua Sha Stone", "Makeup Brush Set", "Facial Steamer"], ["Rose Quartz", "Synthetic"], has_color=True, theme="beauty tools"),
            subcat("giftsets", "Gift Sets", "Health & Beauty > Personal Care > Cosmetics > Cosmetic Sets", "Beauty > Gift Sets", (34, 148), ["Skincare Gift Set", "Self-Care Ritual Box", "Travel Beauty Kit", "Spa Night Set"], ["Assorted"], has_color=False, theme="curated gift set"),
        ],
    },
    {
        "slug": "summit-outdoors",
        "name": "Summit Outdoors",
        "profile_id": "profile_summit_outdoors",
        "brands": ["Summit", "Summit Trail", "Summit Peak"],
        "style": "rugged premium outdoor-gear brand aesthetic, natural granite rock and weathered wood surfaces with soft blurred mountain-trail background, crisp golden-hour daylight, adventurous authentic mood",
        "subcats": [
            subcat("bottles", "Water Bottles & Hydration", "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Water Bottles", "Drinkware > Water Bottles", (24, 58), ["Insulated Bottle", "Hydration Flask", "Collapsible Bottle", "Wide-Mouth Bottle"], ["Stainless Steel", "BPA-Free Plastic"], overlap=True, theme="trail hydration"),
            subcat("backpacks", "Backpacks & Daypacks", "Luggage & Bags > Backpacks", "Bags > Daypacks", (58, 219), ["Hiking Daypack", "Hydration Pack", "Summit Backpack", "Travel Pack"], ["Ripstop Nylon"], overlap=True, theme="hiking packs"),
            subcat("activewear", "Activewear", "Apparel & Accessories > Clothing > Activewear", "Apparel > Activewear", (28, 118), ["Base Layer Top", "Trail Shorts", "Merino Tee", "Insulated Vest"], ["Merino Wool", "Recycled Poly"], sized=True, overlap=True, theme="performance apparel"),
            subcat("earbuds", "Sport Earbuds", "Electronics > Audio > Audio Components > Headphones", "Audio > Sport Earbuds", (49, 179), ["Sport Earbuds", "Bone-Conduction Headset", "Secure-Fit Buds"], ["Sweatproof Polymer"], overlap=True, theme="workout audio"),
            subcat("sunglasses", "Sunglasses", "Apparel & Accessories > Clothing Accessories > Sunglasses", "Accessories > Eyewear > Sunglasses", (45, 165), ["Polarized Sunglasses", "Sport Shield Sunglasses", "Trail Sunglasses"], ["Polycarbonate"], overlap=True, theme="sport eyewear"),
            subcat("yoga", "Yoga & Recovery", "Sporting Goods > Exercise & Fitness > Yoga & Pilates", "Fitness > Yoga & Recovery", (18, 98), ["Yoga Mat", "Foam Roller", "Resistance Band Set", "Massage Ball Set"], ["Natural Rubber", "EVA Foam"], has_color=True, overlap=True, theme="recovery gear"),
            subcat("trackers", "Fitness Trackers", "Electronics > Communications > Telephony > Mobile Phone Accessories > Smart Watches", "Wearables > Fitness Trackers", (79, 299), ["GPS Watch", "Fitness Band", "Multisport Watch"], ["Silicone & Alloy"], overlap=True, theme="outdoor wearables"),
            subcat("camping", "Camping Accessories", "Sporting Goods > Outdoor Recreation > Camping & Hiking", "Outdoor > Camping", (16, 148), ["Camp Stove", "LED Lantern", "Sleeping Pad", "Camp Chair", "Headlamp"], ["Aluminum", "Ripstop"], has_color=True, theme="camp gear"),
            subcat("footwear", "Trail Footwear", "Apparel & Accessories > Shoes", "Footwear > Trail", (68, 198), ["Trail Runner", "Hiking Shoe", "Approach Shoe", "Camp Sandal"], ["Recycled Mesh"], sized=True, theme="trail shoes"),
            subcat("tumblers", "Insulated Tumblers", "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Water Bottles", "Drinkware > Tumblers", (22, 52), ["Insulated Tumbler", "Camp Mug", "Coffee Flask"], ["Stainless Steel"], overlap=True, theme="insulated drinkware"),
        ],
    },
]


def price_str(lo: float, hi: float) -> tuple[str, str]:
    base = round(random.uniform(lo, hi) - 0.01, 2)
    price = f"{base:.2f} {CURRENCY}"
    sale = ""
    if random.random() < 0.22:  # ~22% on sale
        sale_val = round(base * random.uniform(0.75, 0.92) - 0.01, 2)
        sale = f"{sale_val:.2f} {CURRENCY}"
    return price, sale


def make_description(merchant, sc, adj, noun, material, color) -> str:
    bits = [
        f"The {adj} {noun} from {merchant['name']}",
        f"crafted in {material.lower()}" if material != "Standard" and material != "Formula" and material != "Blend" and material != "Assorted" else "thoughtfully made",
    ]
    lead = " ".join(bits[:1])
    detail = {
        "wardrobe basics": "for an easy, everyday layer that pairs with anything.",
        "cozy streetwear": "for weekend comfort with a modern fit.",
        "athleisure": "built to move with breathable, quick-dry performance.",
        "everyday headwear": "to top off any look, sun or shade.",
        "lifestyle eyewear": "with UV400 protection and a timeless silhouette.",
        "sport eyewear": "with polarized, impact-resistant lenses for the trail.",
        "commuter bags": "organized, durable, and ready for the daily commute.",
        "branded hydration": "keeps drinks cold for 24 hours on the go.",
        "trail hydration": "leak-proof and built for long days outside.",
        "everyday accessories": "the small upgrade your rotation needs.",
        "seasonal outerwear": "weather-ready protection without the bulk.",
        "leather goods": "slim, refined, and made to last.",
        "scented home fragrance": "fills the room with a warm, inviting scent.",
        "luxury fragrance": "a layered, long-lasting scent for calm evenings.",
        "handmade drinkware": "for slow mornings and better coffee rituals.",
        "insulated drinkware": "double-walled to keep drinks hot or cold for hours.",
        "kitchen cookware": "even heating for everyday cooking.",
        "soft bedding textiles": "breathable, lived-in softness that gets better with every wash.",
        "cozy loungewear": "the softest way to unwind at home.",
        "home wellness": "to bring a little calm into your daily routine.",
        "kitchen essentials": "the dependable tools every kitchen needs.",
        "home organization": "tidy, natural storage that looks good on the shelf.",
        "dining textiles": "elevate the table for everyday and gatherings alike.",
        "true wireless audio": "with rich sound, deep bass, and all-day battery.",
        "over-ear audio": "studio-grade sound with plush, all-day comfort.",
        "wearable tech": "track workouts, sleep, and notifications at a glance.",
        "outdoor wearables": "rugged GPS tracking for every adventure.",
        "portable audio": "big, room-filling sound that travels anywhere.",
        "phone accessories": "everyday protection and effortless charging.",
        "laptop bags": "padded, secure storage for your laptop and daily carry.",
        "portable power": "fast-charge your devices anywhere, all day.",
        "desk peripherals": "a satisfying, responsive upgrade for your desk.",
        "streaming gear": "look and sound your best on every call and stream.",
        "connectivity": "reliable, fast connections for all your devices.",
        "glass-bottle skincare": "a lightweight formula for visibly healthier skin.",
        "sun care": "broad-spectrum protection that wears beautifully.",
        "hair care": "nourishes and strengthens from root to tip.",
        "bath and body": "leaves skin soft, smooth, and lightly scented.",
        "clean makeup": "a clean, buildable formula for an effortless look.",
        "beauty wellness": "supports glow from the inside out.",
        "perfume": "a signature scent that lasts through the day.",
        "beauty tools": "a spa-quality ritual you can do at home.",
        "curated gift set": "a ready-to-gift set of favorites, beautifully boxed.",
        "hiking packs": "comfortable load-carry for the trail or travel.",
        "performance apparel": "temperature-regulating comfort mile after mile.",
        "workout audio": "secure, sweatproof sound that stays put.",
        "recovery gear": "ease tension and recover faster after training.",
        "camp gear": "compact, dependable gear for basecamp and beyond.",
        "trail shoes": "grippy, cushioned, and ready for any terrain.",
    }.get(sc["theme"], "made for everyday use.")
    color_bit = f" Shown in {color}." if color else ""
    return f"{lead}, {bits[1]}, {detail}{color_bit}"


def gen_merchant(m):
    rows = []
    image_specs = []
    per_subcat = PRODUCTS_PER_MERCHANT // len(m["subcats"])
    remainder = PRODUCTS_PER_MERCHANT - per_subcat * len(m["subcats"])
    mprefix = "".join(w[0] for w in m["slug"].split("-")).upper()

    # Pre-register the 3 images per sub-category, each a distinct product /
    # color / composition so the variants don't look duplicated.
    for sc in m["subcats"]:
        for k in range(1, IMAGES_PER_SUBCAT + 1):
            fname = f"{sc['slug']}-{k}.png"
            noun = sc["nouns"][(k - 1) % len(sc["nouns"])]
            comp = COMPOSITIONS[(k - 1) % len(COMPOSITIONS)]
            material = sc["materials"][(k - 1) % len(sc["materials"])]
            mat_bit = ""
            if material not in ("Standard", "Formula", "Blend", "Assorted"):
                mat_bit = f" in {material.lower()}"
            color = ""
            if sc["has_color"]:
                color = IMAGE_COLORS[(hash(sc["slug"]) + k) % len(IMAGE_COLORS)]
            color_bit = f"{color.lower()} " if color else ""
            image_specs.append({
                "merchant": m["slug"],
                "subcategory": sc["slug"],
                "filename": fname,
                "path": f"public/mock-catalog/images/{m['slug']}/{fname}",
                "web_path": f"{IMAGE_WEB_BASE}/{m['slug']}/{fname}",
                "prompt": (
                    f"Professional studio product photograph of a single {color_bit}"
                    f"{noun.lower()}{mat_bit}, styled for the brand {m['name']} "
                    f"({sc['theme']}). {m['style']}. {comp}. "
                    f"Photorealistic, high-end e-commerce catalog photography, "
                    f"tack-sharp focus, natural material texture, subtle soft shadow, "
                    f"no text, no brand logos, no watermark, no people."
                ),
            })

    seq = 0
    for i, sc in enumerate(m["subcats"]):
        count = per_subcat + (1 if i < remainder else 0)
        used_names = set()
        for j in range(count):
            noun = random.choice(sc["nouns"])
            adj = random.choice(ADJECTIVES)
            material = random.choice(sc["materials"])
            color = random.choice(COLORS) if sc["has_color"] else ""
            # Ensure a unique title within the sub-category.
            title = f"{adj} {noun}"
            attempts = 0
            while title in used_names and attempts < 30:
                adj = random.choice(ADJECTIVES)
                title = f"{adj} {noun}"
                attempts += 1
            if title in used_names:
                title = f"{adj} {noun} {j+1}"
            used_names.add(title)
            if color:
                display_title = f"{title} \u2013 {color}"
            else:
                display_title = title

            seq += 1
            pid = f"{mprefix}-{sc['slug'][:4].upper()}-{seq:04d}"
            price, sale = price_str(*sc["price"])
            brand = random.choice(m["brands"])
            size = random.choice(SIZES) if sc["sized"] else ""
            img_k = (j % IMAGES_PER_SUBCAT) + 1
            image_link = f"{IMAGE_WEB_BASE}/{m['slug']}/{sc['slug']}-{img_k}.png"
            item_group = f"{mprefix}-{sc['slug'][:4].upper()}-GRP-{(j // 2) + 1:03d}"

            rows.append({
                "id": pid,
                "title": display_title,
                "description": make_description(m, sc, adj, noun, material, color),
                "link": f"https://{m['slug']}.example.com/products/{pid.lower()}",
                "image_link": image_link,
                "additional_image_link": "",
                "availability": "in_stock" if random.random() > 0.06 else "out_of_stock",
                "price": price,
                "sale_price": sale,
                "brand": brand,
                "gtin": "",
                "mpn": pid,
                "condition": "new",
                "google_product_category": sc["google_product_category"],
                "product_type": sc["product_type"],
                "item_group_id": item_group,
                "color": color,
                "size": size,
                "material": material if material not in ("Standard", "Formula", "Blend", "Assorted") else "",
                "quantity": str(random.randint(0, 250)),
            })
    return rows, image_specs


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    all_image_specs = []
    summary = []
    batch_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for m in MERCHANTS:
        rows, image_specs = gen_merchant(m)
        all_image_specs.extend(image_specs)
        mdir = os.path.join(OUT_DIR, m["slug"])
        os.makedirs(mdir, exist_ok=True)

        csv_name = "products.csv"
        with open(os.path.join(mdir, csv_name), "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)

        manifest = {
            "stripe_profile_id": m["profile_id"],
            "batch_timestamp": batch_ts,
            "feed_type": "products",
            "total_shards": 1,
            "files": [{"name": csv_name}],
        }
        with open(os.path.join(mdir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        summary.append({"merchant": m["name"], "slug": m["slug"],
                        "profile_id": m["profile_id"], "products": len(rows)})
        print(f"{m['name']:22s} {len(rows):4d} products -> {m['slug']}/{csv_name}")

    with open(os.path.join(OUT_DIR, "image-spec.json"), "w", encoding="utf-8") as f:
        json.dump(all_image_specs, f, indent=2)

    with open(os.path.join(OUT_DIR, "README.md"), "w", encoding="utf-8") as f:
        f.write(build_readme(summary, len(all_image_specs)))

    print(f"\nTotal products: {sum(s['products'] for s in summary)}")
    print(f"Image specs:    {len(all_image_specs)} "
          f"({IMAGES_PER_SUBCAT} per merchant x sub-category)")


def build_readme(summary, n_images) -> str:
    lines = [
        "# Mock catalog (temporary SFTP stand-in)",
        "",
        "Generated by `scripts/generate_mock_catalog.py`. These files mock the",
        "Stripe Agentic Commerce product feeds until the real SFTP feed is live.",
        "Each merchant folder contains a Google Merchant / Stripe style",
        "`products.csv` plus a `manifest.json` (with `stripe_profile_id`).",
        "",
        "| Merchant | Profile ID | Products |",
        "| --- | --- | --- |",
    ]
    for s in summary:
        lines.append(f"| {s['merchant']} | `{s['profile_id']}` | {s['products']} |")
    lines += [
        "",
        f"Images: `image-spec.json` lists {n_images} images to generate",
        "(3 per merchant x sub-category). Product `image_link` values point to",
        "`/mock-catalog/images/<merchant>/<subcategory>-<k>.png`; place generated",
        "images under `public/mock-catalog/images/` so the app can serve them.",
        "",
        "Catalogs intentionally overlap (water bottles, backpacks, earbuds,",
        "candles, sunglasses, activewear, wellness) so one query returns products",
        "from multiple merchants.",
    ]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
