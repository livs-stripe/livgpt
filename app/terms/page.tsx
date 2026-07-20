import type { Metadata } from "next"
import { LegalPage, LegalSection } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Terms of Service | LivGPT",
  description: "The terms governing your use of LivGPT.",
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="June 6, 2026">
      <p>
        These Terms of Service ({'"Terms"'}) govern your access to and use of LivGPT (the
        {' "Service"'}), an AI shopping assistant that helps you discover and purchase products.
        By using the Service, you agree to these Terms.
      </p>

      <LegalSection heading="1. Use of the Service">
        <p>
          LivGPT provides a conversational interface to browse a product catalog and complete
          purchases through our payment processor. You agree to use the Service only for lawful
          purposes and not to misuse, disrupt, or attempt to gain unauthorized access to any part
          of it.
        </p>
      </LegalSection>

      <LegalSection heading="2. Orders and Payments">
        <p>
          Purchases made through LivGPT are processed securely by Stripe. By placing an order, you
          authorize the charge to your selected payment method for the listed price plus any
          applicable taxes and shipping. All prices are shown in the currency indicated at
          checkout.
        </p>
      </LegalSection>

      <LegalSection heading="3. Shipping and Returns">
        <p>
          Estimated delivery times are provided at checkout and are not guaranteed. Returns,
          refunds, and exchanges are handled in accordance with the policy of the selling merchant
          associated with your order.
        </p>
      </LegalSection>

      <LegalSection heading="4. AI-Generated Content">
        <p>
          LivGPT uses AI to generate product recommendations and responses. While we strive for
          accuracy, AI output may occasionally be incomplete or incorrect. Always review product
          details before completing a purchase.
        </p>
      </LegalSection>

      <LegalSection heading="5. Limitation of Liability">
        <p>
          The Service is provided {'"as is"'} without warranties of any kind. To the maximum extent
          permitted by law, LivGPT shall not be liable for any indirect, incidental, or
          consequential damages arising from your use of the Service.
        </p>
      </LegalSection>

      <LegalSection heading="6. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Continued use of the Service after changes
          take effect constitutes acceptance of the revised Terms.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>
          If you have questions about these Terms, contact us at{" "}
          <a href="mailto:support@livgpt.app" className="text-foreground underline underline-offset-4">
            support@livgpt.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
