export const OPERATOR = {
  name: "5 Asides Near Me",
  email: "support@5asidesnearme.com",
};

const privacy = [
  ["Privacy notice", `The platform operator (${OPERATOR.name}) collects account identifiers, contact details, Club and Field membership information, chat and media content, match events, and payment status. We use these to provide accounts, football services, moderation, support, security, and transaction records. Club and Field administrators may see information needed for their roles. Other users may see profile names, team affiliation, published match data, and content you share.`],
  ["Location and device data", "If you permit location access, we use your device location to estimate nearby Clubs. You can deny permission and use other navigation. We may process device identifiers and technical logs for security and app operation. GPS estimates may be inaccurate."],
  ["Payments and service providers", "Payment providers process payment details under their own notices. We keep transaction status and records needed for support and lawful accounting. Hosting, authentication, notification, and storage providers may process data for us, potentially outside South Africa, subject to applicable safeguards."],
  ["Retention and rights", "We keep data only as long as needed for the stated purposes, applicable legal duties, or legitimate disputes, then delete or de-identify it. Field Action Log entries are hidden after seven days and scheduled for deletion after thirty days; other records have different lifetimes. Request access, correction, deletion where applicable, or object to processing by contacting our Information Officer at the support address. You may complain to South Africa's Information Regulator."],
  ["Security and communications", "We apply access controls appropriate to roles and investigate suspected misuse or security incidents. Essential account, match, safety, and service messages are part of operating the platform. Promotional communications require a separate lawful basis and available opt-out; accepting these terms does not opt you into marketing."],
];

export const LEGAL = {
  club: {
    version: "club-2026-09-29-1",
    title: "Club Terms of Service and Privacy Notice",
    sections: [
      ["Operator and agreement", `Your Club agreement is with ${OPERATOR.name}. Contact: ${OPERATOR.email}. By signing, you accept the Club terms for your account and acknowledge this Privacy Notice. The Field agreement is presented separately when you enter a Field.`],
      ["Accounts and Clubs", "Provide accurate information and protect your sign-in. A Club creator or captain must have authority to represent that Club and manage its members. Players join a Club under its administrator's oversight. You must not impersonate anyone, create fake Clubs, harass others, or use the service for unlawful collection of money."],
      ["Football and user content", "Captains manage rosters, match signup, lineup decisions, and Club communications. Match data and peer ratings may be corrected. You retain rights in content you upload but grant us a limited licence to store and display it for the service. Upload only material you have the right to share, including photos and videos of others."],
      ["Bookings and money", "The checkout must show the amount, payee, payment method, cancellation and credit terms before a booking is confirmed. A Club's player contributions and Field bookings are distinct from any platform fee. The applicable refund or credit policy shown at checkout forms part of that purchase; statutory consumer rights remain in force."],
      ["Conduct and moderation", "Club admins may moderate their Club chat. The platform may restrict accounts or content for abuse, fraud, impersonation, or safety concerns. Contact support to challenge a restriction. We may preserve relevant records when reasonably needed for a complaint or lawful investigation."],
      ["Sport and service limits", "Football carries a risk of injury. Follow venue rules, use suitable equipment, and seek medical advice where appropriate. This notice does not waive rights that cannot lawfully be excluded. Availability and third-party services may vary; we will not exclude liability where the law forbids it."],
      ["Changes and disputes", "Material changes will be presented for fresh acceptance before they apply to your continued Club use. Contact support first about complaints. South African law applies, subject to mandatory consumer and privacy rights."],
      ...privacy,
    ],
  },
  field: {
    version: "field-2026-09-29-1",
    title: "Field Terms of Service and Privacy Notice",
    sections: [
      ["Operator and agreement", `Your Field agreement is with ${OPERATOR.name}. Contact: ${OPERATOR.email}. By signing, you accept the Field terms for your role and acknowledge this Privacy Notice. Club terms remain separate.`],
      ["Field authority and staff", "A Field manager must have authority to register the venue, invite Clubs, appoint staff, and publish its information. Staff access depends on approved Field roles. Referees may operate authorised matches; Club members entering through their Clubs do not become Field staff or Field database members."],
      ["League records", "Field managers coordinate seasons, fixtures, match days, results, standings, and statistics. Authorised officials record events. Corrections and season archive operations may affect published tables. The Field is responsible for verifying sporting decisions and communicating competition rules to participating Clubs."],
      ["Field communications", "Field announcements and chat may be visible to participating Clubs and their authenticated members when enabled. Users must not harass others or share unlawful content. Field administrators may remove content or restrict chat access for misuse, with a route to support for disputed decisions."],
      ["Venue services and money", "The Field operator is responsible for the accuracy of its location, availability, prices, venue rules, and any Field-specific booking terms it offers. Any checkout must identify the seller and show price and cancellation terms. The platform does not silently assume a Field's obligations."],
      ["Safety and service limits", "Football and attendance at a venue can involve injury. Fields must disclose unusual risks and maintain legally required safety measures. This notice does not waive rights that cannot lawfully be excluded. Availability may vary; liability limits are subject to South African law."],
      ["Changes and disputes", "Material changes will be presented for fresh acceptance before continued Field use. Contact support first about complaints. South African law applies, subject to mandatory consumer and privacy rights."],
      ...privacy,
    ],
  },
};

export function legalText(scope) {
  const document = LEGAL[scope];
  return [document.title, document.version, ...document.sections.flat()].join("\n");
}
