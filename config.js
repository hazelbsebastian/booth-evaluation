// ============================================================
//  EDIT THIS FILE to customize the site.
// ============================================================
window.APP_CONFIG = {
  // Paste your Google Apps Script Web App URL here (see README.md).
  // Leave empty ("") to run in DEMO MODE: data is saved only in this browser,
  // and the admin password is "admin".
  SCRIPT_URL: "",

  // Shown in the header of every page.
  EVENT: {
    title: "Service Learning Competency: IT Skills Demonstration",
    date: "2026-10-15",
    venue: "University of La Salette",
    organizer: "College of Information Technology"
  },

  // ---- Topics ----
  // Each topic has its own passkeys, its own open/closed switch (on the admin page)
  // and its own certificate.
  //   id           short code, letters/numbers/dashes only. Don't change it after keys are generated.
  //   name         shown to participants and admins
  //   certificate  your Canva design exported as PNG, with the name area left blank.
  //                Leave "" to use the built-in certificate design.
  //   nameY        how far down the participant's name is printed, in mm (page is 210mm tall)
  TOPICS: [
    { id: "utp", name: "UTP Cable Termination", certificate: "assets/certificates/utp-cable-termination.png", nameY: 111 },
    { id: "router-wifi", name: "Router and Wi-Fi Configuration", certificate: "", nameY: 111 },
    { id: "troubleshooting", name: "Basic Network Troubleshooting", certificate: "", nameY: 111 }
  ],

  // How many passkeys the admin can generate at once.
  MAX_KEYS_PER_BATCH: 200,

  // ---- Attendance form ----
  // Colleges shown in the dropdown. Leave empty [] to let attendees type their college instead.
  COLLEGES: [
    "College of Information Technology",
    "College of Arts and Sciences",
    "College of Accountancy",
    "College of Business Education",
    "College of Teacher Education",
    "College of Nursing, Public Health and Midwifery",
    "College of Medicine, Allied and Medical Programs",
    "College of Criminal Justice Education",
    "College of Engineering and Architecture"
  ],
  YEAR_LEVELS: ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "Graduate / Others"],

  // ---- Evaluation ----
  RATING_SCALE: [
    { value: 5, label: "Strongly Agree" },
    { value: 4, label: "Agree" },
    { value: 3, label: "Neutral" },
    { value: 2, label: "Disagree" },
    { value: 1, label: "Strongly Disagree" }
  ],

  // "id" becomes the column name in the sheet; "short" is used in the admin table.
  QUESTIONS: [
    { id: "q1",  short: "Objectives",   label: "Were the objectives of the session clearly explained?" },
    { id: "q2",  short: "Clarity",      label: "Was the information presented easy to understand?" },
    { id: "q3",  short: "Relevance",    label: "Were the topics relevant and useful to you?" },
    { id: "q4",  short: "Procedures",   label: "Did the demonstrators explain the procedures clearly?" },
    { id: "q5",  short: "Hands-on",     label: "Were the hands-on demonstrations helpful in understanding the topics?" },
    { id: "q6",  short: "Materials",    label: "Were the materials and equipment used appropriate for the demonstrations?" },
    { id: "q7",  short: "Demonstrators", label: "Were the demonstrators knowledgeable and prepared?" },
    { id: "q8",  short: "Time",         label: "Was the time allotted for each demonstration sufficient?" },
    { id: "q9",  short: "Skills gained", label: "Did the session help improve your knowledge and practical IT skills?" },
    { id: "q10", short: "Overall",      label: "Overall, were you satisfied with the session?" }
  ],

  FEEDBACK: [
    { id: "liked",       short: "Liked most",  label: "What did you like most about the session?" },
    { id: "suggestions", short: "Suggestions", label: "What suggestions do you have to improve future IT Skills demonstrations?" }
  ],

  // ---- Built-in certificate (used for topics without a "certificate" image) ----
  CERT_LOGO_LEFT: "assets/cit-logo.png",
  CERT_LOGO_RIGHT: "assets/uls-seal.png",
  CERT_EVENT_TYPE: "demonstration",   // "...valuable contribution to the demonstration."
  CERT_SIGNATORIES: [
    // { name: "Juan Dela Cruz", title: "Dean, College of Information Technology", signature: "assets/signature-1.png" },
  ],
  CERT_NAME_COLOR: "#111111"
};
