// ============================================================
//  EDIT THIS FILE to customize the site.
// ============================================================
window.APP_CONFIG = {
  // Paste your Google Apps Script Web App URL here (see README.md).
  // Leave empty ("") to run in DEMO MODE: data is saved only in this browser,
  // and the admin password is "admin".
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyM4dWUVbQGIBv6-C17isAFd6KHC5WB0gICkTpPDvPSIhjU7eLswnIkqth4dxx-md_l/exec",

  // Shown in the header of every page.
  EVENT: {
    title: "Service Learning Competency: 4th Year IT Skills Demonstration",
    date: "2026-10-16",
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
    { id: "router-wifi", name: "Router and Wi-Fi Configuration", certificate: "assets/certificates/router-wifi-configuration.png", nameY: 111 },
    { id: "troubleshooting", name: "Basic Network Troubleshooting", certificate: "assets/certificates/basic-network-troubleshooting.png", nameY: 111 }
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

  // ---- Rating scale (used by both the pre- and post-evaluation) ----
  RATING_SCALE: [
    { value: 5, label: "Strongly Agree" },
    { value: 4, label: "Agree" },
    { value: 3, label: "Neutral" },
    { value: 2, label: "Disagree" },
    { value: 1, label: "Strongly Disagree" }
  ],

  // ---- Pre-evaluation (answered with the passkey BEFORE the demo) ----
  // Each topic has its own statements, keyed by topic id. "id" becomes the column name
  // in the PreEvaluation sheet; "short" is used in the admin page.
  PRE_QUESTIONS: {
    utp: [
      { id: "p1", short: "UTP basics",     label: "I know what a UTP cable is and what it is used for." },
      { id: "p2", short: "Tools",          label: "I can identify the tools used in cable termination (RJ45 connector, crimping tool, wire stripper, cable tester)." },
      { id: "p3", short: "T568B order",    label: "I know the T568B wire color order." },
      { id: "p4", short: "Cable testing",  label: "I understand why a cable should be tested after crimping." },
      { id: "p5", short: "Tool safety",    label: "I know how to handle stripping and crimping tools safely." }
    ],
    "router-wifi": [
      { id: "p1", short: "Router role",    label: "I know what a router does in a network." },
      { id: "p2", short: "WAN vs LAN",     label: "I can tell the difference between the WAN/Internet port and the LAN ports." },
      { id: "p3", short: "SSID & password", label: "I know what an SSID is and how to set a strong Wi-Fi password." },
      { id: "p4", short: "Admin password", label: "I know the difference between the router's admin password and the Wi-Fi password." },
      { id: "p5", short: "Wi-Fi security", label: "I know which Wi-Fi security settings are recommended (such as WPA2-AES or WPA3)." }
    ],
    troubleshooting: [
      { id: "p1", short: "First steps",    label: "I know what to check first when a device cannot connect to the network." },
      { id: "p2", short: "Physical checks", label: "I can check cables, Wi-Fi status and router lights to find a connection problem." },
      { id: "p3", short: "ipconfig",       label: "I know how to use ipconfig to see a computer's IP address and default gateway." },
      { id: "p4", short: "ping",           label: "I know how to use the ping command to test a connection." },
      { id: "p5", short: "Safe process",   label: "I know why I should change one thing at a time and not reset equipment without permission." }
    ]
  },

  PRE_FEEDBACK: [
    { id: "expectations", short: "Expectations", label: "What do you hope to learn from this demonstration?" }
  ],

  // ---- Post-evaluation (answered with the same passkey AFTER the demo) ----
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
