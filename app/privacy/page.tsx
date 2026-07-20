import type { Metadata } from "next"
import { LegalPage, LegalSection } from "@/components/legal-page"

export const metadata: Metadata = {
  title: "Privacy Policy | LivGPT",
  description: "How LivGPT collects, uses, and protects your information.",
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="June 6, 2026">
      <p>
        This Privacy Policy explains how LivGPT (the {'"Service"'}) collects, uses, and protects
        your information when you use our AI shopping assistant.
      </p>

      <LegalSection heading="1. Information We Collect">
        <p>
          We collect the messages you send to the assistant, the products you view or purchase, and
          the shipping and payment details you provide at checkout. Conversation history is stored
          locally in your browser. Payment information is collected and processed directly by
          Stripe and is never stored on our servers.
        </p>
      </LegalSection>

      <LegalSection heading="2. How We Use Information">
        <p>
          We use your information to operate the shopping assistant, generate product
          recommendations, process orders, arrange shipping, and improve the Service. Chat messages
          are sent to our AI provider solely to generate responses.
        </p>
      </LegalSection>

      <LegalSection heading="3. Third-Party Services">
        <p>
          We rely on trusted third parties to deliver the Service, including Stripe for payment
          processing and an AI model provider for generating responses. These providers handle your
          data according to their own privacy policies.
        </p>
      </LegalSection>

      <LegalSection heading="4. Data Retention">
        <p>
          Your conversation history is retained in your browser&apos;s local storage until you clear
          it. Order and payment records are retained by Stripe and the selling merchant as required
          for transaction and legal purposes.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your Choices">
        <p>
          You can clear your conversation history at any time from within the app. You may also
          request information about the data associated with your orders by contacting us.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          We use industry-standard measures to protect your information. Payment data is encrypted
          and handled by Stripe&apos;s PCI-compliant infrastructure.
        </p>
      </LegalSection>

      <LegalSection heading="7. Contact">
        <p>
          If you have questions about this Privacy Policy, contact us at{" "}
          <a href="mailto:privacy@livgpt.app" className="text-foreground underline underline-offset-4">
            privacy@livgpt.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
