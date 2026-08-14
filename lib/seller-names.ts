/**
 * Merchant display names for the demo sellers, listed under every seller id a
 * merchant appears as: the bundled demo catalog's placeholder ids and the real
 * Stripe sandbox profile ids their SFTP feeds carry (the same pairing as
 * PROFILE_IDS in sftp-server/build_catalog.py).
 *
 * A Stripe seller profile id is an opaque token with no name to recover from
 * it, and a feed's `brand` column names the product's brand rather than the
 * store, so a merchant that ships sub-brands needs a mapping like this one.
 *
 * Safe to import from the browser: it holds nothing but public brand names
 * against sandbox profile ids, which already reach the client on every product.
 */
const MERCHANTS: { name: string; sellerIds: string[] }[] = [
  {
    name: "Harbor & Home",
    sellerIds: [
      "profile_harbor_and_home",
      "profile_test_61V4rlJR6SOOGr86bA6V4rlIU4SQJK89xjP3m2SoKQrI",
    ],
  },
  {
    name: "Lumen Beauty",
    sellerIds: [
      "profile_lumen_beauty",
      "profile_test_61V4s0tdP53DpqIXuA6V4s0tU4SQZfNb2ovpf4CVU2TI",
    ],
  },
  {
    name: "Northwind Apparel",
    sellerIds: [
      "profile_northwind_apparel",
      "profile_test_61V4s3wzOLA0Xsg2jA6V4s3wU4SQc5wYyQkQKKCngHku",
    ],
  },
  {
    name: "Summit Outdoors",
    sellerIds: [
      "profile_summit_outdoors",
      "profile_test_61V4s6BwbaSJ9V7veA6V4s6AU4SQNkjbEkRaK94bYC7E",
    ],
  },
  { name: "VoltEdge Electronics", sellerIds: ["profile_voltedge_electronics"] },
  { name: "Meridian Travel Co.", sellerIds: ["profile_meridian_travel"] },
  { name: "Fern & Field", sellerIds: ["profile_fern_and_field"] },
]

const BY_SELLER_ID = new Map(
  MERCHANTS.flatMap((m) => m.sellerIds.map((id) => [id, m.name] as const)),
)

/** The known merchant display name for a seller id, if there is one. */
export function knownSellerName(sellerId?: string): string | undefined {
  return sellerId ? BY_SELLER_ID.get(sellerId) : undefined
}
