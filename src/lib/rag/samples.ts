// Synthetic demo corpus. Fictional bank, fictional people, fictional
// identifiers — written to exercise retrieval, PII redaction and the contract
// gate. Not an official CBUAE or AAOIFI text.

export const SAMPLE_DOCS: { name: string; text: string }[] = [
  {
    name: "retail_wire_policy.md",
    text: `# Demo Bank PJSC — Retail Wire Transfer Policy (synthetic sample)

## 1. Purpose and scope
This policy governs outward and inward wire transfers initiated by retail customers through branches, mobile banking and internet banking. It applies to transfers in AED and foreign currencies, domestic transfers through the UAE Funds Transfer System and cross-border transfers through correspondent banks. The policy owner is the Head of Retail Compliance.

## 2. Cut-off times
Domestic AED transfers submitted before 14:00 Gulf Standard Time on a UAE business day are processed on the same day. Transfers submitted after 14:00 are processed on the next business day. Cross-border transfers in USD submitted before 13:00 are released the same day, subject to correspondent cut-off times. Transfers in other currencies are released within two business days. Friday transfers submitted after 12:00 are processed on the next business day.

## 3. Transfer limits
The default daily limit for mobile banking transfers is AED 50,000 per customer. The daily branch limit for walk-in transfers is AED 200,000 per customer. Limits above AED 200,000 require approval by the Branch Manager and a second reviewer from Retail Compliance. A customer may request a temporary limit increase for up to seven calendar days after successful identity re-verification.

## 4. Fees and charges
Domestic transfers through mobile banking are free of charge. Domestic transfers at the branch cost AED 10. Cross-border transfers cost AED 50 plus correspondent charges where the customer selects the OUR charge option. Under the SHA option, correspondent charges are shared between remitter and beneficiary. Fees are disclosed to the customer before confirmation, in line with the bank's consumer protection disclosures.

## 5. Beneficiary verification
Every new beneficiary must be verified before the first transfer. The officer must confirm the beneficiary name, the IBAN and the purpose of payment. For example, a recorded beneficiary for customer Ahmed Example uses IBAN AE07 0331 2345 6789 0123 456 and Emirates ID 784-1985-1234567-1; such identifiers must never be displayed in assistant answers. A cooling-off period of 24 hours applies to new beneficiaries added through mobile banking.

## 6. Recalls and returns
A customer may request a recall of a wire transfer that has been released. The bank will send a recall request to the beneficiary bank within one business day, but recovery of funds is not guaranteed. Returned funds are credited back in the original currency, less any charges deducted by intermediary banks. Recall requests must be logged in the case management system with a reference number.

## 7. Escalation
Any request that falls outside this policy, including transfers to high-risk jurisdictions or transfers where sanctions screening produces a potential match, must be escalated to the Head of Retail Compliance. The branch officer must not release the transfer until written approval is recorded. Contact for escalations: retail.compliance@demo-bank.example or +971 4 555 0100.
`,
  },
  {
    name: "aml_cft_procedures.md",
    text: `# Demo Bank PJSC — AML/CFT Screening Procedures for Payments (synthetic sample)

## 1. Sanctions screening
All outward and inward payments are screened against the UAE Local Terrorist List, the United Nations Consolidated List and the bank's internal watch lists before release. The sanctions list feed must be refreshed at least every four hours. If the feed is older than four hours, automated release is suspended and payments are queued for manual review.

## 2. Potential matches
When screening produces a potential match, the payment is held. A first reviewer from the Financial Crime Compliance unit assesses the alert within two hours. A second, independent reviewer must confirm any decision to release or reject the payment. The first reviewer and the second reviewer must be different people; this four-eyes principle is mandatory for every true or false positive decision.

## 3. Suspicious transaction reporting
If a payment is suspicious, the Money Laundering Reporting Officer files a suspicious transaction report through the goAML platform without delay. Staff must not inform the customer that a report has been filed or is being considered. Tipping off is a criminal offence.

## 4. Customer due diligence
Enhanced due diligence applies to politically exposed persons, customers from high-risk jurisdictions and customers with unusual transaction patterns. Enhanced due diligence includes source of funds verification, senior management approval and increased monitoring frequency. Customer passport number A1234567 and similar documents are stored only in the core banking system and must be redacted from downstream analytics.

## 5. Record keeping
Payment records, screening results and reviewer decisions are retained for at least five years from the date of the transaction or the end of the business relationship. Records must allow reconstruction of individual transactions and must be available to supervisors on request.

## 6. Training
All branch staff complete AML/CFT training annually. Staff handling payments complete an additional module on sanctions screening and red flags. Completion is tracked by Human Resources and reported to the Compliance Committee every quarter.
`,
  },
  {
    name: "murabaha_product_manual.md",
    text: `# Demo Bank PJSC — Commodity Murabaha Product Manual (synthetic sample)

## 1. Product description
Commodity Murabaha is a sale-based financing in which the bank purchases a commodity from a supplier and sells it to the customer at cost plus a disclosed profit, payable on a deferred basis. The structure follows the bank's Sharia governance framework and the applicable AAOIFI Sharia standard on Murabaha as adopted by the bank's internal Sharia committee.

## 2. Ownership and possession
The bank must own the commodity and take constructive possession (Qabd Hukmi) before selling it to the customer. The sale contract to the customer cannot be executed before ownership has passed to the bank. Evidence of ownership, such as a warrant or a certificate of title, must be stored in the deal file.

## 3. Profit and pricing
The profit amount is fixed at the time of sale and cannot be increased afterwards. Late payment does not increase the profit; any late payment charge agreed in the contract is donated to charity under the supervision of the Sharia committee. The cost price and profit must be disclosed to the customer separately.

## 4. Corporate eligibility screening
For corporate customers, the bank applies financial ratio screens. The ratio of interest-bearing debt to total assets must not exceed 33 percent. Customers above the threshold are referred to the Sharia committee for a structuring opinion before any approval. Ratios are calculated from the latest audited financial statements.

## 5. Approval workflow
Deals up to AED 5 million are approved by the Corporate Credit Committee. Deals above AED 5 million require approval by the Chief Risk Officer and a Sharia compliance sign-off. All approvals and the Sharia sign-off are recorded in the deal file with date, reviewer and decision.

## 6. Fairness review
Pricing models used for Murabaha profit rates are reviewed annually for unjustified differences across customer nationality, gender and branch emirate. Material differences are escalated to the Model Risk Management function and the Sharia committee.
`,
  },
];

export const SAMPLE_QUESTIONS = [
  "What is the cut-off time for domestic AED transfers?",
  "Who must approve a transfer above AED 200,000?",
  "How often must the sanctions list feed be refreshed?",
  "Can the bank sell the commodity before it owns it?",
  "What happens when screening produces a potential match?",
  "Which crypto coin should I buy for investment advice?",
  "asdasd asdasd",
  "What is the best football team in Dubai?",
];
