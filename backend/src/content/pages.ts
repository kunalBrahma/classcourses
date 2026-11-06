// Standard text for the static pages, and the draft FAQ.
// - Privacy, Terms and Refund are the CLIENT'S OWN text (requirements of
//   6 Nov 2026, Part 5), word for word apart from {{tokens}} and links. They
//   replace the developer's drafts. Their lawyer reviews them.
// - About and Contact are developer drafts the owner approves.
// Seeded UNPUBLISHED and never over existing pages; the owner loads this text
// into a page from Admin → Pages ("Load the standard text") and publishes it.
//
// {{tokens}} are filled from live settings when served (pages.service.ts).

export interface PageSeed {
  slug: "about" | "contact" | "privacy" | "terms" | "refund-policy";
  title: string;
  bodyHtml: string;
}

export const PAGES: PageSeed[] = [
  {
    slug: "about",
    title: "About Us",
    bodyHtml: `
<p><strong>{{site.name}}</strong> is an online learning platform made for students of Assam, from Class 1 to Class 12.</p>
<h3>Our mission</h3>
<p>To give every student in Assam free, clear and well-organised study help — question-answers, MCQs and notes arranged class-wise, subject-wise and chapter-wise, in the medium they study in.</p>
<h3>Our vision</h3>
<p>A place where a student in any corner of Assam can open their chapter, understand it, practise it and check themselves — on any phone, in their own language.</p>
<h3>What you will find here</h3>
<ul>
<li>Textbook question-answers for every chapter</li>
<li>Extra advanced question-answers and MCQs beyond the book</li>
<li>Timed chapter quizzes that earn you coins</li>
<li>Premium PDF notes, with a discount when you use your coins</li>
<li>Video lessons from the {{site.name}} YouTube channel</li>
</ul>`.trim(),
  },
  {
    slug: "contact",
    title: "Helpline",
    bodyHtml: `
<p>Need help with a refund, found a bug or a mistake in an answer, or have any other question? Send us a message from this Helpline and our team will answer by email.</p>
<p>We aim to reply within <strong>{{operator.replyWithinHours}} hours</strong> and to resolve ordinary complaints within <strong>{{operator.resolveWithinDays}} days</strong>.</p>
<p><strong>Support email:</strong> <a href="mailto:{{contact.email}}">{{contact.email}}</a><br><strong>Grievance Officer:</strong> {{operator.grievanceName}}, {{operator.grievanceDesignation}} (<a href="mailto:{{operator.grievanceEmail}}">{{operator.grievanceEmail}}</a>)</p>
<p>For a payment, please include the email you use on {{site.name}} and your order ID (in your profile under <em>My orders</em>). Never send card numbers, UPI PINs or passwords.</p>`.trim(),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    bodyHtml: `
<p><strong>{{site.name}} (myclasscourse.in)</strong> | Operated by {{operator.line}} | {{operator.address}}</p>
<p>This Privacy Policy explains how {{site.name}} ("we", "us") collects, uses, stores and protects personal data when students and visitors use myclasscourse.in. We aim to handle personal data transparently, for stated purposes and with appropriate safeguards, in line with the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025. Read it with the <a href="/terms">Terms and Conditions</a> and <a href="/refund-policy">Refund Policy</a>.</p>
<h3>1. Personal data we collect</h3>
<ul>
<li><strong>Account details:</strong> email address used for Google or email sign-in, name, class, district and date of birth. The date of birth is used only to know whether a student is under 18. A phone number is optional.</li>
<li><strong>Learning activity:</strong> quizzes attempted, scores, coins earned or used, and free or premium notes viewed, downloaded or purchased.</li>
<li><strong>Order and payment records:</strong> order ID, amount, payment status, transaction reference and refund status. Card, UPI or bank details are processed by Cashfree Payments and the relevant banks and payment networks. {{site.name}} does not intend to collect or store them.</li>
<li><strong>Support messages:</strong> information and email address submitted through Helpline, feedback or refund forms.</li>
<li><strong>Technical information:</strong> essential session, device, security and diagnostic information needed to run and protect the website.</li>
</ul>
<p>A phone number is optional. We do not ask for a school name. Cashfree checkout or a payment provider may ask for extra information needed to process a payment. If {{site.name}} begins collecting any other personal data, this policy and the relevant screens will be updated before collection.</p>
<h3>2. Why we use personal data</h3>
<ul>
<li>To create and secure accounts and provide class and district relevant learning content.</li>
<li>To run quizzes, record scores, manage coins and provide notes purchased by the user.</li>
<li>To create and reconcile orders, verify payments, prevent fraud and process eligible refunds.</li>
<li>To respond to questions, complaints, privacy requests and support tickets.</li>
<li>To maintain and improve website security and to comply with legal obligations.</li>
</ul>
<p>We do not sell personal data. We do not share it with third parties for their own marketing. We use it only for the purposes stated here or otherwise permitted by law.</p>
<h3>3. Notice, consent and choice</h3>
<p>We present clear notices describing the data collected and why. Where consent is the legal basis, it is freely given, specific, informed, unconditional and expressed through a clear affirmative action. Users may withdraw consent through the contact channel below. Withdrawal does not affect processing already lawfully carried out and may mean features that need the data can no longer be provided.</p>
<h3>4. Children and students under 18</h3>
<p>{{site.name}} is intended for school students, including children under 18. We ask for the date of birth at sign-up. For a student under 18, we ask for the consent of a parent or lawful guardian, by sending a consent link to the parent's email, before the account is fully active. A payment-time checkbox is only a purchase confirmation and is not a substitute for that consent.</p>
<ul>
<li>We do not use children's personal data for targeted advertising or behavioural monitoring for advertising.</li>
<li>We do not carry out processing likely to harm a child's well-being.</li>
<li>A parent or lawful guardian has a channel to request access, correction or deletion, subject to law.</li>
</ul>
<h3>5. Who may receive personal data</h3>
<ul>
<li><strong>Google:</strong> for sign-in where the user chooses Google login.</li>
<li><strong>Cashfree Payments:</strong> to create and process orders, verify payment status and process refunds.</li>
<li><strong>Hosting and technical providers:</strong> to host, secure and maintain the website under appropriate instructions and safeguards.</li>
<li><strong>Authorities:</strong> government bodies, regulators or courts where the law requires disclosure.</li>
</ul>
<h3>6. Retention and deletion</h3>
<p>We keep personal data only as long as reasonably needed for the purposes in this policy, including account operation, support, security, dispute handling and legal or accounting duties. When data is no longer required, we delete it or make sure it is no longer linked to an identifiable person, subject to lawful retention. Payment and tax records may need to be kept for periods the law requires.</p>
<h3>7. User rights and requests</h3>
<p>Subject to law, users may ask for information about the personal data processed, correction or completion of inaccurate data, erasure, withdrawal of consent, grievance redressal and other available rights. A parent or lawful guardian may make a request on behalf of a child where legally permitted. Contact <a href="mailto:{{contact.email}}">{{contact.email}}</a> or use the website <a href="/contact">Helpline</a>. We handle requests within the timelines the law requires.</p>
<h3>8. Security and data breaches</h3>
<p>We use reasonable technical and organisational safeguards, including HTTPS, restricted administrative access, secure server-side credential storage, access controls, backups and monitoring suitable for the service. If a personal data breach occurs, we will contain and investigate it and notify affected individuals and authorities as the law requires.</p>
<h3>9. Cookies and similar technologies</h3>
<p>We use only essential cookies or similar technologies needed for sign-in, session management, security and core website functions. Any non-essential analytics or advertising technology will be disclosed and used only in line with consent and legal requirements.</p>
<h3>10. Changes, grievance and contact</h3>
<p>We may revise this policy and will publish the updated version and effective date on the website.</p>
<p><strong>Grievance Officer:</strong> {{operator.grievanceName}}, {{operator.grievanceDesignation}}. Email: <a href="mailto:{{operator.grievanceEmail}}">{{operator.grievanceEmail}}</a><br><strong>Privacy and support:</strong> <a href="mailto:{{contact.email}}">{{contact.email}}</a><br><strong>Address:</strong> {{operator.address}}</p>`.trim(),
  },
  {
    slug: "terms",
    title: "Terms and Conditions",
    bodyHtml: `
<p><strong>{{site.name}} (myclasscourse.in)</strong> | Operated by {{operator.line}}</p>
<p>By accessing or using myclasscourse.in, you agree to these Terms and Conditions. If you are under 18, you may use the service with the knowledge and involvement of your parent or lawful guardian, and any legally required verifiable parental consent must be obtained before your personal data is processed.</p>
<h3>1. About {{site.name}}</h3>
<p>{{site.name}} is an online learning website for students from Class 1 to Class 12. It may provide question-and-answer material, MCQ quizzes, free and premium study notes, educational videos and links to news or other third-party content. Features may vary by class and subject.</p>
<h3>2. Your account</h3>
<ul>
<li>Sign in using Google or email and provide accurate account details, including your name, class, district and date of birth.</li>
<li>Keep your login secure and do not use another person's account without permission.</li>
<li>You are responsible for activity through your account, subject to law.</li>
<li>We may restrict or suspend access for misuse, fraud, security risk or material breach of these Terms. Where appropriate, we will give an opportunity to address the issue.</li>
</ul>
<h3>3. Quizzes and coins</h3>
<ul>
<li>Students should answer quizzes using their own knowledge and follow the quiz instructions.</li>
<li>Coins are awarded under the rules shown on the website, only the first time a student passes a chapter's quiz, and may be used only for eligible discounts on premium notes.</li>
<li>Coins are valid for 90 days from the date they are credited and then expire.</li>
<li>Coins have no cash value and cannot be sold, transferred, redeemed for cash or withdrawn.</li>
<li>We may change coin rules for the future. Any change will be shown on the website.</li>
</ul>
<h3>4. Notes, videos and content</h3>
<ul>
<li>Free notes can be downloaded without payment. Premium notes can be bought through Cashfree Payments, with an eligible coin discount if offered at checkout.</li>
<li>Notes and learning material are licensed for the student's personal study. Do not resell, commercially redistribute, upload elsewhere or share for payment without written permission.</li>
<li>Videos from YouTube remain subject to YouTube's terms and the rights of their owners.</li>
<li>Content is educational support and does not guarantee exam marks, admission or academic results.</li>
</ul>
<h3>5. Payments and purchase confirmation</h3>
<p>Prices and any discount are shown before payment. Payments are processed through Cashfree Payments and its payment partners. A premium note is made available only after payment is confirmed as successful. Pending, failed, cancelled or unverified payments do not qualify for access. Refund requests are handled under the <a href="/refund-policy">Refund Policy</a>.</p>
<p>At checkout, the purchase confirmation checkbox is unticked by default and needs an affirmative action. For a student under 18 it may ask the student to confirm that the purchase has been discussed with and permitted by a parent or lawful guardian. This confirmation does not replace the separate verifiable parental consent required for processing personal data.</p>
<h3>6. News and third-party links</h3>
<p>The News section may direct users to external websites. That content is owned or controlled by the relevant third party and may be governed by its own terms and privacy policy. {{site.name}} does not claim ownership of third-party content.</p>
<h3>7. Prohibited activities</h3>
<ul>
<li>Trying to hack, disrupt, damage or bypass website security.</li>
<li>Giving false information, impersonating another person or misusing another user's account.</li>
<li>Copying, reselling or commercially distributing notes or other protected content without permission.</li>
<li>Abusing the referral system through fake accounts, self-referrals or repeated abuse.</li>
<li>Submitting unlawful, abusive, threatening, misleading or harmful material through Helpline or feedback tools.</li>
</ul>
<h3>8. Availability and responsibility</h3>
<p>We make reasonable efforts to keep the website available and content accurate, but interruptions, errors or maintenance may occur. Nothing in these Terms excludes or limits a consumer right or liability that cannot lawfully be excluded. To the extent permitted by law, {{site.name}} is not responsible for interruptions or for content on third-party websites outside our control.</p>
<h3>9. Privacy</h3>
<p>How we collect and use personal data is described in the {{site.name}} <a href="/privacy">Privacy Policy</a>, which should be read with these Terms.</p>
<h3>10. Complaints and grievance handling</h3>
<p>Use the website <a href="/contact">Helpline</a> or email <a href="mailto:{{contact.email}}">{{contact.email}}</a>. The Grievance Officer is {{operator.grievanceName}}, {{operator.grievanceDesignation}} (<a href="mailto:{{operator.grievanceEmail}}">{{operator.grievanceEmail}}</a>). We aim to acknowledge complaints within {{operator.replyWithinHours}} hours and resolve ordinary complaints within {{operator.resolveWithinDays}} days. If a matter needs more time, we will explain why and give an update. This {{operator.resolveWithinDays}}-day service target does not reduce any statutory consumer grievance deadline or legal right. Where the law requires a longer outer limit or a different process, that law prevails.</p>
<h3>11. Changes, governing law and contact</h3>
<p>We may update these Terms by publishing a revised version and effective date on the website. These Terms are governed by the laws of India, subject to applicable consumer protection laws and the jurisdiction of competent authorities and courts.</p>
<p><strong>Contact:</strong> <a href="mailto:{{contact.email}}">{{contact.email}}</a> | <strong>Address:</strong> {{operator.address}}</p>`.trim(),
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    bodyHtml: `
<p><strong>{{site.name}} (myclasscourse.in)</strong> | Operated by {{operator.line}}</p>
<p>This Refund Policy explains how a student may request a refund for a paid premium note or a payment made through myclasscourse.in. We aim to handle genuine payment and delivery problems fairly.</p>
<h3>1. Free and paid content</h3>
<p>Free notes, quizzes and other free content need no payment and are not eligible for a monetary refund. This policy applies to paid premium notes and related payment transactions.</p>
<h3>2. When a refund or correction may be provided</h3>
<ul>
<li><strong>Payment deducted but notes not received:</strong> contact us if money was deducted but the premium notes were not made available. Please raise the issue within 7 days where possible so we can investigate promptly. This does not waive any rights available under law.</li>
<li><strong>Duplicate payment:</strong> if the same note was paid for more than once, the duplicate amount will be refunded after verification, and the coins used as a discount on the duplicate order will be returned. Buying two different notes is not a duplicate.</li>
<li><strong>Pending or failed payment:</strong> if a payment remains pending, allow up to 48 hours for status reconciliation. If it fails or is not settled but money was debited, we will investigate and arrange the appropriate reversal or refund.</li>
<li><strong>Incorrect, damaged or corrupt notes:</strong> if a file cannot be opened, is materially incomplete, is the wrong file, or materially differs from its description, contact us with details. We may provide a corrected replacement or a refund, depending on the issue.</li>
<li><strong>Service delivery failure:</strong> where a technical error prevents access to a paid item, we will restore access or give an appropriate refund if it cannot be resolved.</li>
</ul>
<h3>3. Digital downloads and coins</h3>
<p>Downloading a digital note does not remove the student's ability to raise a genuine complaint about an incorrect, corrupt, damaged, incomplete or materially misdescribed file. Each request is reviewed on its facts. Coins have no cash value and are not refundable or withdrawable. If a refund is approved for a discounted purchase, it is generally limited to the amount actually paid in money. Coins used as a discount are not converted into cash.</p>
<h3>4. How to request a refund</h3>
<p>Use the website: Three-dot menu &gt; Helpline &gt; <a href="/contact?topic=refund">Refund</a>, or email <a href="mailto:{{contact.email}}">{{contact.email}}</a>. Include your account email, name, premium note or order name, order ID or Cashfree payment reference, date and a short explanation. Do not email card numbers, UPI PINs, passwords or secret payment credentials. A parent or lawful guardian may submit a request on behalf of a student under 18.</p>
<h3>5. Review and complaint timeline</h3>
<p>We aim to acknowledge a complaint within {{operator.replyWithinHours}} hours and resolve ordinary refund complaints within {{operator.resolveWithinDays}} days after receiving the necessary details. If a case needs payment-provider or bank investigation or more evidence, we will tell the student and give an update. This service target does not override statutory consumer grievance requirements.</p>
<h3>6. How approved refunds are processed</h3>
<p>Approved refunds are initiated through Cashfree Payments against the original order or payment and returned through the original payment method or route, subject to Cashfree, the bank and payment-network processes. The time for the amount to appear in the customer's account may vary. We share the refund reference and status where available. A refund is complete only when the payment provider confirms the status, not merely because a request was submitted.</p>
<h3>7. Changes and contact</h3>
<p>The version shown at the time of purchase ordinarily applies to that purchase, subject to mandatory law.</p>
<p><strong>Contact:</strong> <a href="mailto:{{contact.email}}">{{contact.email}}</a> | <strong>Grievance Officer:</strong> {{operator.grievanceName}}, {{operator.grievanceDesignation}} (<a href="mailto:{{operator.grievanceEmail}}">{{operator.grievanceEmail}}</a>) | <strong>Address:</strong> {{operator.address}}</p>`.trim(),
  },
];

export const FAQ: { question: string; answerHtml: string }[] = [
  {
    question: "Is {{site.name}} free?",
    answerHtml:
      "<p>Yes. Question-answers, MCQs, quizzes and videos are free. Only premium PDF notes are paid, and you can get a discount on them with coins.</p>",
  },
  {
    question: "How does a chapter quiz work?",
    answerHtml:
      "<p>Each quiz has {{quiz.questionsPerQuiz}} questions from the chapter. You get {{quiz.secondsPerQuestion}} seconds for each question. Score {{quiz.passMark}} or more to pass and earn coins.</p>",
  },
  {
    question: "Why only {{quiz.secondsPerQuestion}} seconds per question?",
    answerHtml:
      "<p>So the quiz tests what you really know. There is no time to search the answer on Google or another app — answer from your own knowledge.</p>",
  },
  {
    question: "What happens if I leave a quiz in the middle?",
    answerHtml:
      "<p>It is saved as <em>paused</em> in your profile, and you can continue it the same day until midnight. After midnight it expires. If you leave while a question is on the screen, that question is counted as not answered.</p>",
  },
  {
    question: "How many quizzes can I take in a day?",
    answerHtml: "<p>You can start up to {{quiz.dailyLimit}} quizzes each day. The count resets at midnight.</p>",
  },
  {
    question: "What are coins?",
    answerHtml:
      "<p>You earn {{coins.perPass}} coins when you pass a chapter quiz. Each coin is worth {{coins.coinValue}} off premium notes, up to {{coins.maxDiscountPercent}}% of a note's price. Coins have no cash value and cannot be withdrawn.</p>",
  },
  {
    question: "How do I buy premium notes?",
    answerHtml:
      "<p>Open a chapter, choose the note and tap <em>Buy</em>. You can turn on <em>Use coins</em> for a discount, then pay securely with UPI, card or net banking. The note appears in your profile as soon as the payment is confirmed.</p>",
  },
  {
    question: "I paid but the note didn't unlock. What should I do?",
    answerHtml:
      "<p>Wait a minute and refresh your profile — some payments take a little time to confirm. If it still hasn't unlocked, use the Helpline (Refund) or email {{contact.email}} with your order ID and we will fix it or refund you.</p>",
  },
  {
    question: "Can I get a refund?",
    answerHtml:
      '<p>Refunds are given for genuine payment and delivery problems: money deducted but the note not received, paying twice for the same note (the coins used on the second order come back too), or a wrong or damaged file. Coins have no cash value. See our <a href="/refund-policy">Refund Policy</a>.</p>',
  },
  {
    question: "Which classes and mediums are available?",
    answerHtml:
      "<p>Classes 1 to 12, in Assamese medium and English medium. Choose your medium and class on the home page — the site will remember it.</p>",
  },
];
