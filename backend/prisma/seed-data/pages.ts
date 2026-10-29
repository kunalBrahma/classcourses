// DRAFT content for the static pages and FAQ, written by the developer from
// the requirements PDF and how the site actually works (PDF §1.1, §1.4, §5.2).
// Seeded UNPUBLISHED: the owner must read and approve every page before it
// goes live. The legal pages are a starting point, not legal advice — have
// them reviewed (see task.md "Waiting on client").
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
    title: "Contact Us",
    bodyHtml: `
<p>Have a question, found a mistake in an answer, or need help with a payment? Write to us and we will reply as soon as we can.</p>
<p><strong>Email:</strong> <a href="mailto:{{contact.email}}">{{contact.email}}</a></p>
<p>For payment problems, please include the email you use on {{site.name}} and your order ID (shown in your profile under <em>My orders</em>).</p>`.trim(),
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    bodyHtml: `
<p>This policy explains what information {{site.name}} collects, why, and how it is protected. By using {{site.name}} you agree to this policy.</p>
<h3>Information we collect</h3>
<ul>
<li><strong>Account details:</strong> your name, email address, mobile number and password. We email you a one-time code to confirm the email address is yours. Your mobile number is seen only by our team, to help you with your account or a purchase; we don't share it or send marketing messages to it. Passwords are stored only in encrypted (hashed) form — nobody at {{site.name}} can read them.</li>
<li><strong>Study preferences:</strong> the medium and class you choose, so the site opens where you left off.</li>
<li><strong>Learning activity:</strong> quiz attempts, scores and the coins you earn or use.</li>
<li><strong>Purchases:</strong> which notes you bought, the amount paid and the order ID.</li>
<li><strong>Messages you send us:</strong> when you use the contact form, your name, email, the topic, your message and (only if you add it) your mobile number, so we can answer you.</li>
</ul>
<h3>Payments</h3>
<p>Payments are processed by <strong>Razorpay</strong>. Your card, UPI or bank details are entered on Razorpay's secure page and are <strong>never stored by {{site.name}}</strong>. We only receive confirmation that a payment succeeded, the amount and a payment reference.</p>
<h3>How we use your information</h3>
<ul>
<li>To run your account, quizzes, coins and purchases</li>
<li>To send emails you need, such as password resets and purchase receipts</li>
<li>To keep the site secure and prevent misuse</li>
</ul>
<p>We do not sell your personal information, and we do not show third-party advertising based on it.</p>
<h3>Cookies and local storage</h3>
<p>We store a login token in your browser to keep you signed in. We do not use advertising cookies.</p>
<h3>Students under 18</h3>
<p>Many of our users are school students. If you are under 18, please use {{site.name}} with the knowledge and consent of a parent or guardian, and ask them before making any purchase. A parent or guardian can contact us to review or delete a child's account.</p>
<h3>Keeping and deleting your data</h3>
<p>We keep your account information while your account is active. You can ask us to delete your account by writing to {{contact.email}}. Records of payments may be kept for as long as the law requires.</p>
<h3>Security</h3>
<p>We use encrypted connections (HTTPS), hashed passwords and restricted access to protect your information. No system is perfectly secure, but we work to keep your data safe.</p>
<h3>Changes to this policy</h3>
<p>We may update this policy. The date at the top of this page shows when it was last changed.</p>
<h3>Contact</h3>
<p>Questions about privacy: <a href="mailto:{{contact.email}}">{{contact.email}}</a></p>`.trim(),
  },
  {
    slug: "terms",
    title: "Terms of Service",
    bodyHtml: `
<p>These terms apply to your use of {{site.name}}. By creating an account or using the site, you agree to them.</p>
<h3>Your account</h3>
<ul>
<li>Give a correct email address and keep your password private. You are responsible for activity on your account.</li>
<li>If you are under 18, you should use {{site.name}} with a parent's or guardian's consent, and a parent or guardian should approve any purchase.</li>
<li>One account per person. Accounts may be suspended for misuse, cheating in quizzes, or attempts to break the site.</li>
</ul>
<h3>Study content</h3>
<p>Question-answers, MCQs, notes and videos on {{site.name}} are for your personal study. You may not copy, sell, re-upload or share them publicly, including premium PDF notes you have bought. We work hard to keep answers correct; if you find a mistake, please tell us.</p>
<h3>Quizzes</h3>
<ul>
<li>A quiz has {{quiz.questionsPerQuiz}} questions with {{quiz.secondsPerQuestion}} seconds for each. Answer from your own knowledge.</li>
<li>Scoring {{quiz.passMark}} or more out of {{quiz.questionsPerQuiz}} is a pass.</li>
<li>You can start up to {{quiz.dailyLimit}} quizzes a day. A quiz you leave in the middle can be continued the same day until midnight (India time). If you leave while a question is on the screen, that question is counted as not answered.</li>
</ul>
<h3>Coins</h3>
<ul>
<li>You earn coins by passing quizzes, as described on the site.</li>
<li>Coins can only be used for a discount on premium notes on {{site.name}}. They have <strong>no cash value</strong>, cannot be transferred or exchanged for money, and cannot be withdrawn.</li>
<li>We may change how many coins are earned or what they are worth. Coins gained through cheating or errors may be removed.</li>
</ul>
<h3>Premium notes and payments</h3>
<ul>
<li>Prices are shown in Indian Rupees (₹) before you pay. Payments are handled by Razorpay.</li>
<li>A note is unlocked in your account once your payment is confirmed. You can download it from your profile.</li>
<li>Refunds and cancellations follow our <a href="/refund-policy">Cancellation &amp; Refund Policy</a>.</li>
</ul>
<h3>Availability</h3>
<p>We try to keep {{site.name}} available at all times but cannot promise it will never be interrupted. We may add, change or remove content and features.</p>
<h3>Limitation of liability</h3>
<p>{{site.name}} is a study aid. It does not replace your school textbooks or teachers, and we are not responsible for exam results.</p>
<h3>Governing law</h3>
<p>These terms are governed by the laws of India, and disputes are subject to the courts of Assam.</p>
<h3>Contact</h3>
<p><a href="mailto:{{contact.email}}">{{contact.email}}</a></p>`.trim(),
  },
  {
    slug: "refund-policy",
    title: "Cancellation & Refund Policy",
    bodyHtml: `
<p>Premium notes on {{site.name}} are digital products that you can download immediately after payment. Please read this policy before you buy.</p>
<h3>Cancellation</h3>
<ul>
<li>You can cancel before paying simply by closing the payment window. Nothing is charged.</li>
<li>An order that is not paid within 30 minutes is cancelled automatically. Any coins you applied to it are returned to your account.</li>
<li>Once a payment is completed and the note is unlocked, the order cannot be cancelled.</li>
</ul>
<h3>Refunds</h3>
<p>Because notes are delivered instantly as downloads, we do not offer refunds for a change of mind. We <strong>will</strong> refund you in full if:</p>
<ul>
<li>you were charged but the note was not unlocked in your account, and we cannot fix it;</li>
<li>you were charged twice for the same note (this is refunded <strong>automatically</strong>, you don't need to ask; any coins used on that second payment are returned too); or</li>
<li>the file is damaged or is not the note described, and we cannot replace it.</li>
</ul>
<p>To ask for a refund, email <a href="mailto:{{contact.email}}">{{contact.email}}</a> within <strong>7 days</strong> of payment with your registered email and order ID.</p>
<h3>How refunds are paid</h3>
<p>Approved refunds are sent to your original payment method through Razorpay. The money usually reaches your account in 5–7 working days, depending on your bank.</p>
<p>Coins used for a discount are returned to your {{site.name}} account, not paid out as money, because coins have no cash value.</p>
<h3>Contact</h3>
<p><a href="mailto:{{contact.email}}">{{contact.email}}</a></p>`.trim(),
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
      "<p>Open a chapter, choose the note and tap <em>Buy</em>. You can turn on <em>Use coins</em> for a discount, then pay securely with UPI, card or net banking through Razorpay. The note appears in your profile as soon as the payment is confirmed.</p>",
  },
  {
    question: "I paid but the note didn't unlock. What should I do?",
    answerHtml:
      "<p>Wait a minute and refresh your profile — some payments take a little time to confirm. If it still hasn't unlocked, email {{contact.email}} with your order ID and we will fix it or refund you.</p>",
  },
  {
    question: "Can I get a refund?",
    answerHtml:
      '<p>Notes are digital downloads, so there are no refunds for a change of mind. You will get a full refund if you were charged but didn\'t get the note, or were charged twice. See our <a href="/refund-policy">Cancellation &amp; Refund Policy</a>.</p>',
  },
  {
    question: "Which classes and mediums are available?",
    answerHtml:
      "<p>Classes 1 to 12, in Assamese medium and English medium. Choose your medium and class on the home page — the site will remember it.</p>",
  },
];
