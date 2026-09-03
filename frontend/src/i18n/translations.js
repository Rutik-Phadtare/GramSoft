// Every string here was written directly in Marathi (not machine-translated
// or transliterated) using the client's own terminology from their real
// paper forms wherever it overlaps - ग्रामपंचायत, तालुका, जिल्हा, सरपंच,
// ग्रामसेवक, फोन नं. etc. are their exact words. For anything outside that
// vocabulary, standard administrative Marathi is used. This is UI chrome
// only - actual data (names, places, notes) is typed by whoever enters it,
// in whichever language they choose; nothing here auto-translates
// user-entered content.
export const translations = {
  en: {
    // Nav / shell
    dashboard: "Dashboard", logActivity: "Log Activity", explorer: "Explorer",
    grampanchayats: "Grampanchayats", contacts: "Contacts", feedbackInbox: "Feedback Inbox",
    registrations: "Registrations", approvals: "Approvals", bulkImport: "Bulk Import",
    employees: "Employees", tasks: "Tasks", myTasks: "My Tasks", settings: "Settings", logOut: "Log out",
    live: "Live", reconnecting: "Reconnecting…", admin: "Admin", employee: "Employee",

    // Common actions / words
    save: "Save", saveChanges: "Save changes", saving: "Saving…", cancel: "Cancel",
    suggestChange: "Suggest a change", category: "Category", affectedArea: "Affected area", changeTitle: "Change title", details: "Details", expectedOutcome: "Expected outcome", priority: "Priority", page: "Page / screen", reference: "Reference", metadata: "Additional context",
    edit: "Edit", delete: "Delete", add: "Add", search: "Search…", clear: "Clear",
    back: "Back", next: "Next", submit: "Submit", close: "Close", confirm: "Confirm",
    yes: "Yes", no: "No", loading: "Loading…", viewAll: "View all", exportCsv: "Export CSV",
    exporting: "Exporting…", show: "Show", hide: "Hide", select: "Select…", optional: "optional",
    required: "required", all: "All", none: "None", total: "Total", actions: "Actions",

    // Common fields
    name: "Name", nameMarathi: "Name (Marathi)", address: "Address", addressMarathi: "Address (Marathi)",
    phone: "Phone", email: "Email", designation: "Designation", taluka: "Taluka", district: "District",
    pincode: "Pincode", grampanchayat: "Grampanchayat", notes: "Notes", status: "Status",
    population: "Population", households: "Households", date: "Date", sortBy: "Sort by",

    // Designations
    designation_Talathi: "Talathi", designation_Gramsevak: "Gramsevak", designation_Sarpanch: "Sarpanch",
    designation_Sachiv: "Sachiv", designation_ComputerOperator: "Computer Operator", designation_Other: "Other",

    // Language
    language: "Language", english: "English", marathi: "Marathi",

    // Employee dashboard
    employeeDashboardTitle: "Welcome back", employeeDashboardDesc: "Log today's field activity and keep an eye on your recent work.",
    loggedToday: "Logged today", thisWeek: "This week", last7Days: "Last 7 days",
    yourRecentActivity: "Your recent activity", updatesLive: "Updates live as you log new entries.",
    noActivityYet: "No activity logged yet", logFirstEntry: "Log your first entry",

    // Activity log form
    dailyLog: "Daily log", logFieldActivityTitle: "Log field activity",
    logFieldActivityDesc: "Every call and visit, recorded the moment it happens.",
    entrySaved: "Entry saved. Log another whenever you're ready.",
    activityType: "Activity type", contactPerson: "Contact person",
    searchGpPlaceholder: "Search Grampanchayat by name…", searchPersonPlaceholder: "Search by name — Talathi, Sarpanch, Gramsevak…",
    contactDetailsConfirm: "Confirm or correct contact details", contactDetailsNew: "Add contact details (new contact)",
    contactDetailsHint: "Sent to your admin for approval before it updates the directory — never saved directly.",
    selectGpFirst: "Select a Grampanchayat above to see its contacts.",
    suggestNewContact: "This person isn't in the list — suggest a new contact",
    suggestForGp: "Suggesting a contact for",
    timeSpent: "Time spent (minutes)", nextFollowUp: "Next follow-up date (optional)",
    notesPlaceholder: "Summarize the call or visit in your own words…",
    notesLabel: "Notes — what was said, discussed, or done", saveEntry: "Save entry", backToDashboard: "Back to dashboard",
    theirResponse: "Their response", problemAndSolution: "What problem did they report, and how did you solve it?",

    // Admin dashboard
    ownerOverview: "Owner overview", everythingAtAGlance: "Everything, at a glance",
    liveAcrossEveryone: "Live across every employee, every Grampanchayat, every call.",
    openExplorer: "Open explorer", usingOurSoftware: "Using our software", contactsOnFile: "Contacts on file",
    activityThisWeek: "Activity this week", pendingFeedback: "Pending feedback", activeEmployees: "Active employees",
    liveActivity: "Live activity", streamingIn: "Streaming in as your team logs calls and visits.",
    noActivityAtAll: "No activity yet", willShowUpHere: "It will show up here the moment your team starts logging.",

    // Explorer
    explorerTitle: "Explorer", explorerDesc: "Search and filter across every activity entry, Grampanchayat, and contact.",
    tabActivity: "Activity", tabGrampanchayats: "Grampanchayats", tabContacts: "Contacts",
    searchActivityPlaceholder: "Search by employee, contact, or Grampanchayat name…",
    searchGpListPlaceholder: "Search Grampanchayats by name…", searchContactsPlaceholder: "Search contacts by name…",
    allActivityTypes: "All activity types", allDesignations: "All designations", anySoftwareStatus: "Any software status",
    allDistricts: "All districts", allTalukas: "All talukas", to: "to",
    newResultsAvailable: "New results available — click to refresh",
    noMatchingResults: "No matching results", tryAdjustingFilters: "Try adjusting your search or filters.",
    when: "When", employeeCol: "Employee", type: "Type", contact: "Contact", notesCol: "Notes", time: "Time",

    // Software status
    softwareStatus_active: "Active user", softwareStatus_churned: "Previously used", softwareStatus_never_used: "Never used",
    activeUsers: "Active users", previouslyUsedNotNow: "Previously used, not now", neverUsedSoftware: "Never used",
    postedAtActiveGp: "Posted at an active user", postedAtChurnedGp: "Posted at a churned GP", postedAtNeverUsedGp: "Posted at a never-used GP",

    // Sort options
    sortRecentlyContacted: "Recently contacted", sortNewest: "Newest added", sortOldest: "Oldest added",
    sortNameAsc: "Name (A–Z)", sortNameDesc: "Name (Z–A)", sortPopulationDesc: "Population (high–low)", sortPopulationAsc: "Population (low–high)",

    // Grampanchayats directory
    directory: "Directory", grampanchayatsTitle: "Grampanchayats",
    grampanchayatsDesc: "Every Grampanchayat on file, with software status and contact history.",
    addGrampanchayat: "Add Grampanchayat", noGrampanchayatsFound: "No Grampanchayats found",
    addOneOrImport: "Add one manually, or use Bulk Import for a full sheet.", lastContact: "Last contact",

    // Grampanchayat detail
    backToGrampanchayats: "Back to Grampanchayats", registrationDetails: "Registration details",
    mukamPost: "Mu. Po.", officePhone: "Office phone", officeEmail: "Office email", waterSupply: "Water supply",
    reassessmentYears: "Reassessment years", combined: "Combined", separate: "Separate",
    softwareAndBilling: "Software & billing", started: "Started", renewalDue: "Renewal due", ended: "Ended",
    contractLength: "Contract length", price: "Price", paymentMode: "Payment mode", usingInstead: "Using instead",
    rateTables: "Rate tables", saveRates: "Save rates", taxRates: "Tax rates", constructionRates: "Construction rates", landRates: "Land rates",
    lastWorkedBy: "Last worked by", currentContacts: "Current contacts", addContact: "Add contact",
    noCurrentContact: "No current contact on file", activityHistory: "Activity history",
    changeHistory: "Change history", pastContacts: "Past contacts", editDetails: "Edit details",
    basicInfo: "Basic info", gpType: "GP type", single: "Single", group: "Group",
    reassessmentFrom: "Reassessment from", reassessmentTo: "Reassessment to",
    currentlyUsingSoftware: "Currently using our software", startDate: "Start date", renewalDeadline: "Renewal / deadline",
    yearsPurchased: "Years purchased", whatUsingInstead: "What are they using instead?",
    existingContact: "Existing contact", newContact: "New contact", searchContacts: "Search contacts",

    // Contacts directory + detail
    contactsTitle: "Contacts", contactsDesc: "Every Talathi, Gramsevak, Sarpanch, and Sachiv on file — with their posting history.",
    noContactsFound: "No contacts found", backToContacts: "Back to Contacts",
    handledGps: "Handled", concurrentPostings: "concurrent postings", previousNumbers: "previous number",
    addressSection: "Address", currentPosting: "Current posting", notCurrentlyPosted: "Not currently posted anywhere on file",
    lastActivity: "Last activity", noActivityWithContact: "No activity logged with this contact yet",
    previousPhoneNumbers: "Previous phone numbers", replaced: "Replaced", pastPostings: "Past postings",
    recordTransfer: "Record transfer", transferHint: "Closes their current posting(s) and opens a new one at the Grampanchayat you pick below.",
    confirmTransfer: "Confirm transfer", newGrampanchayat: "New Grampanchayat", since: "Since",

    // Feedback / Registrations inbox
    feedbackInboxTitle: "Feedback & publicity form", feedbackInboxDesc: "Responses from the public intake form — review, then merge into the directory.",
    shareForm: "Share form", markReviewed: "Mark reviewed", mergeIntoDirectory: "Merge into directory",
    new_: "New", reviewed: "Reviewed", merged: "Merged",
    registrationsTitle: "New Grampanchayat registrations",
    registrationsDesc: "Full onboarding submissions — office details, contacts, and local tax rates — ready to become a real Grampanchayat record.",
    viewFullDetails: "View office details & tax rates", hideFullDetails: "Hide full details",

    // Approvals
    approvalsTitle: "Approvals", approvalsDesc: "Contact details employees have added or corrected in the field, waiting for your review before they update the directory.",
    pending: "Pending", approved: "Approved", rejected: "Rejected",
    approve: "Approve", reject: "Reject", newContactLabel: "New contact", updateToExisting: "Update to existing contact",
    proposedBy: "Proposed by", viewCurrentRecord: "view current record", noRequestsFound: "No",

    // Employees
    employeesTitle: "Employees", employeesDesc: "Create accounts for your field team and manage roles.",
    addEmployee: "Add employee", noEmployeesYet: "No employees yet", active: "Active", inactive: "Inactive",
    role: "Role", team: "Team", sales: "Sales", support: "Support", temporaryPassword: "Temporary password",
    backToEmployees: "Back to Employees", totalLogs: "Total logs", firstLogged: "First logged", dailyLogSection: "Daily log",
    noLogEntriesInRange: "No log entries in this range",

    // Settings
    configuration: "Configuration", settingsTitle: "Settings", settingsDesc: "Manage what your team and your public form ask for.",
    activityTypesLabel: "Activity Types", activityFieldsLabel: "Activity Form Fields", feedbackFieldsLabel: "Feedback Form Fields",
    registrationFieldsLabel: "Registration Form Fields", addType: "Add type", addField: "Add field",
    noCustomFieldsYet: "No custom fields yet.", fieldKey: "Key (no spaces)", fieldLabel: "Label shown to user",
    fieldType: "Field type", fieldOptions: "Options (comma-separated)",

    // Import
    importTitle: "Import a spreadsheet",
    importDesc: "Upload an Excel or CSV sheet of Grampanchayats and contacts. Existing records are matched and updated, not duplicated.",
    chooseFileOrDrag: "Click to choose a file, or drag one here", import: "Import", importing: "Importing…",
    importSummary: "Import summary", expectedColumns: "Expected column headers",

    // Login
    signInTitle: "Sign in to your operations console", signIn: "Sign in", signingIn: "Signing in…",
    accountsCreatedByAdmin: "Accounts are created by an admin from Settings → Employees.",
  },
  mr: {
    dashboard: "डॅशबोर्ड", logActivity: "दैनंदिन नोंद", explorer: "शोध",
    grampanchayats: "ग्रामपंचायती", contacts: "संपर्क", feedbackInbox: "अभिप्राय इनबॉक्स",
    registrations: "नोंदणी अर्ज", approvals: "मंजुरी प्रलंबित", bulkImport: "मोठ्या प्रमाणात आयात",
    employees: "कर्मचारी", tasks: "कामे", myTasks: "माझी कामे", settings: "सेटिंग्ज", logOut: "बाहेर पडा",
    live: "लाइव्ह", reconnecting: "पुन्हा जोडत आहे…", admin: "प्रशासक", employee: "कर्मचारी",

    save: "जतन करा", saveChanges: "बदल जतन करा", saving: "जतन करत आहे…", cancel: "रद्द करा",
    edit: "संपादित करा", delete: "हटवा", add: "जोडा", search: "शोधा…", clear: "साफ करा",
    back: "मागे", next: "पुढे", submit: "सादर करा", close: "बंद करा", confirm: "निश्चित करा",
    yes: "होय", no: "नाही", loading: "लोड होत आहे…", viewAll: "सर्व पहा", exportCsv: "CSV निर्यात करा",
    exporting: "निर्यात करत आहे…", show: "दाखवा", hide: "लपवा", select: "निवडा…", optional: "पर्यायी",
    required: "आवश्यक", all: "सर्व", none: "काहीही नाही", total: "एकूण", actions: "क्रिया",

    name: "नाव", nameMarathi: "नाव (मराठी)", address: "पत्ता", addressMarathi: "पत्ता (मराठी)",
    phone: "फोन नं.", email: "ईमेल", designation: "पदनाम", taluka: "तालुका", district: "जिल्हा",
    pincode: "पिन कोड", grampanchayat: "ग्रामपंचायत", notes: "टीप", status: "स्थिती",
    population: "लोकसंख्या", households: "घरांची संख्या", date: "दिनांक", sortBy: "क्रमवारी",

    designation_Talathi: "तलाठी", designation_Gramsevak: "ग्रामसेवक", designation_Sarpanch: "सरपंच",
    designation_Sachiv: "सचिव", designation_ComputerOperator: "संगणक कर्मचारी", designation_Other: "इतर",

    language: "भाषा", english: "इंग्रजी", marathi: "मराठी",

    employeeDashboardTitle: "पुन्हा स्वागत आहे", employeeDashboardDesc: "आजची फील्ड कामे नोंदवा आणि तुमचे अलीकडील काम पहा.",
    loggedToday: "आज नोंदवले", thisWeek: "या आठवड्यात", last7Days: "मागील ७ दिवस",
    yourRecentActivity: "तुमची अलीकडील नोंद", updatesLive: "नवीन नोंदी करताच लाइव्ह अद्ययावत होते.",
    noActivityYet: "अजून कोणतीही नोंद नाही", logFirstEntry: "पहिली नोंद करा",

    dailyLog: "दैनंदिन नोंद", logFieldActivityTitle: "फील्ड कामाची नोंद करा",
    logFieldActivityDesc: "प्रत्येक कॉल आणि भेट, घडताक्षणीच नोंदवली जाते.",
    entrySaved: "नोंद जतन झाली. तयार असल्यास आणखी एक नोंद करा.",
    activityType: "कामाचा प्रकार", contactPerson: "संपर्क व्यक्ती",
    searchGpPlaceholder: "ग्रामपंचायतीचे नाव टाकून शोधा…", searchPersonPlaceholder: "नावाने शोधा — तलाठी, सरपंच, ग्रामसेवक…",
    contactDetailsConfirm: "संपर्काचे तपशील निश्चित करा किंवा दुरुस्त करा", contactDetailsNew: "संपर्क तपशील जोडा (नवीन संपर्क)",
    contactDetailsHint: "निर्देशिकेत अद्ययावत होण्याआधी प्रशासकाच्या मंजुरीसाठी पाठवले जाते — थेट जतन होत नाही.",
    selectGpFirst: "संपर्क पाहण्यासाठी वरील ग्रामपंचायत निवडा.",
    suggestNewContact: "ही व्यक्ती यादीत नाही — नवीन संपर्क सुचवा",
    suggestForGp: "यांच्यासाठी संपर्क सुचवत आहात:",
    timeSpent: "किती वेळ लागला (मिनिटे)", nextFollowUp: "पुढील पाठपुरावा दिनांक (पर्यायी)",
    notesPlaceholder: "कॉल किंवा भेटीचा सारांश तुमच्या शब्दांत लिहा…",
    notesLabel: "टीप — काय बोलणे, चर्चा किंवा काम झाले", saveEntry: "नोंद जतन करा", backToDashboard: "डॅशबोर्डवर परत जा",
    theirResponse: "त्यांचा प्रतिसाद", problemAndSolution: "त्यांनी कोणती अडचण सांगितली आणि तुम्ही ती कशी सोडवली?",

    ownerOverview: "मालक विहंगावलोकन", everythingAtAGlance: "सर्व काही, एका दृष्टीक्षेपात",
    liveAcrossEveryone: "प्रत्येक कर्मचारी, प्रत्येक ग्रामपंचायत, प्रत्येक कॉलवर लाइव्ह.",
    openExplorer: "शोध उघडा", usingOurSoftware: "आमचे सॉफ्टवेअर वापरत आहेत", contactsOnFile: "नोंदीतील संपर्क",
    activityThisWeek: "या आठवड्यातील नोंदी", pendingFeedback: "प्रलंबित अभिप्राय", activeEmployees: "सक्रिय कर्मचारी",
    liveActivity: "लाइव्ह कामकाज", streamingIn: "तुमची टीम कॉल आणि भेटी नोंदवताच येथे दिसते.",
    noActivityAtAll: "अजून कोणतेही कामकाज नाही", willShowUpHere: "तुमची टीम नोंद करताच ते इथे दिसेल.",

    explorerTitle: "शोध", explorerDesc: "प्रत्येक कामाची नोंद, ग्रामपंचायत आणि संपर्क यामध्ये शोधा व गाळून पहा.",
    tabActivity: "कामकाज", tabGrampanchayats: "ग्रामपंचायती", tabContacts: "संपर्क",
    searchActivityPlaceholder: "कर्मचारी, संपर्क किंवा ग्रामपंचायतीच्या नावाने शोधा…",
    searchGpListPlaceholder: "ग्रामपंचायतींना नावाने शोधा…", searchContactsPlaceholder: "संपर्कांना नावाने शोधा…",
    allActivityTypes: "सर्व कामाचे प्रकार", allDesignations: "सर्व पदनामे", anySoftwareStatus: "कोणतीही सॉफ्टवेअर स्थिती",
    allDistricts: "सर्व जिल्हे", allTalukas: "सर्व तालुके", to: "ते",
    newResultsAvailable: "नवीन निकाल उपलब्ध — रिफ्रेश करण्यासाठी क्लिक करा",
    noMatchingResults: "जुळणारे निकाल नाहीत", tryAdjustingFilters: "तुमचा शोध किंवा फिल्टर बदलून पहा.",
    when: "केव्हा", employeeCol: "कर्मचारी", type: "प्रकार", contact: "संपर्क", notesCol: "टीप", time: "वेळ",

    softwareStatus_active: "सक्रिय वापरकर्ता", softwareStatus_churned: "पूर्वी वापरले", softwareStatus_never_used: "कधीही वापरले नाही",
    activeUsers: "सक्रिय वापरकर्ते", previouslyUsedNotNow: "पूर्वी वापरले, आता नाही", neverUsedSoftware: "कधीही वापरले नाही",
    postedAtActiveGp: "सक्रिय वापरकर्त्याकडे नियुक्त", postedAtChurnedGp: "पूर्वी वापरणाऱ्या GP कडे नियुक्त", postedAtNeverUsedGp: "कधीही न वापरणाऱ्या GP कडे नियुक्त",

    sortRecentlyContacted: "अलीकडे संपर्क झालेले", sortNewest: "नवीन जोडलेले", sortOldest: "जुने जोडलेले",
    sortNameAsc: "नाव (अ–ज्ञ)", sortNameDesc: "नाव (ज्ञ–अ)", sortPopulationDesc: "लोकसंख्या (जास्त–कमी)", sortPopulationAsc: "लोकसंख्या (कमी–जास्त)",

    directory: "निर्देशिका", grampanchayatsTitle: "ग्रामपंचायती",
    grampanchayatsDesc: "नोंदीतील प्रत्येक ग्रामपंचायत, सॉफ्टवेअर स्थिती आणि संपर्क इतिहासासह.",
    addGrampanchayat: "ग्रामपंचायत जोडा", noGrampanchayatsFound: "कोणतीही ग्रामपंचायत सापडली नाही",
    addOneOrImport: "स्वतः एक जोडा, किंवा संपूर्ण यादीसाठी मोठ्या प्रमाणात आयात वापरा.", lastContact: "शेवटचा संपर्क",

    backToGrampanchayats: "ग्रामपंचायतींकडे परत जा", registrationDetails: "नोंदणी तपशील",
    mukamPost: "मु. पो.", officePhone: "कार्यालय फोन नं.", officeEmail: "कार्यालय ईमेल", waterSupply: "पाणीपुरवठा",
    reassessmentYears: "फेरआकारणी वर्षे", combined: "एकत्र", separate: "वेगळा",
    softwareAndBilling: "सॉफ्टवेअर व बिलिंग", started: "सुरुवात", renewalDue: "नूतनीकरण देय", ended: "संपले",
    contractLength: "कराराचा कालावधी", price: "किंमत", paymentMode: "पैसे भरण्याची पद्धत", usingInstead: "त्याऐवजी वापरत आहेत",
    rateTables: "दर तक्ते", saveRates: "दर जतन करा", taxRates: "कर आकारणी दर", constructionRates: "बांधकाम दर", landRates: "जमिनीचे रेडीरेकर दर",
    lastWorkedBy: "शेवटचे काम केले", currentContacts: "सध्याचे संपर्क", addContact: "संपर्क जोडा",
    noCurrentContact: "सध्या कोणताही संपर्क नोंदीत नाही", activityHistory: "कामकाजाचा इतिहास",
    changeHistory: "बदलांचा इतिहास", pastContacts: "मागील संपर्क", editDetails: "तपशील संपादित करा",
    basicInfo: "मूलभूत माहिती", gpType: "ग्रामपंचायत प्रकार", single: "एकल", group: "समूह",
    reassessmentFrom: "फेरआकारणी सुरुवात", reassessmentTo: "फेरआकारणी शेवट",
    currentlyUsingSoftware: "सध्या आमचे सॉफ्टवेअर वापरत आहेत", startDate: "सुरुवातीचा दिनांक", renewalDeadline: "नूतनीकरण / अंतिम मुदत",
    yearsPurchased: "विकत घेतलेली वर्षे", whatUsingInstead: "ते त्याऐवजी काय वापरत आहेत?",
    existingContact: "अस्तित्वात असलेला संपर्क", newContact: "नवीन संपर्क", searchContacts: "संपर्क शोधा",

    contactsTitle: "संपर्क", contactsDesc: "नोंदीतील प्रत्येक तलाठी, ग्रामसेवक, सरपंच आणि सचिव — त्यांच्या नियुक्ती इतिहासासह.",
    noContactsFound: "कोणताही संपर्क सापडला नाही", backToContacts: "संपर्कांकडे परत जा",
    handledGps: "हाताळलेल्या", concurrentPostings: "एकाचवेळी नियुक्त्या", previousNumbers: "मागील क्रमांक",
    addressSection: "पत्ता", currentPosting: "सध्याची नियुक्ती", notCurrentlyPosted: "सध्या कुठेही नियुक्त नाही",
    lastActivity: "शेवटचे कामकाज", noActivityWithContact: "या संपर्कासोबत अजून कोणतेही कामकाज नोंदवलेले नाही",
    previousPhoneNumbers: "मागील फोन क्रमांक", replaced: "बदलले", pastPostings: "मागील नियुक्त्या",
    recordTransfer: "बदली नोंदवा", transferHint: "सध्याची नियुक्ती बंद करून खाली निवडलेल्या ग्रामपंचायतीत नवीन नियुक्ती सुरू करते.",
    confirmTransfer: "बदली निश्चित करा", newGrampanchayat: "नवीन ग्रामपंचायत", since: "पासून",

    feedbackInboxTitle: "अभिप्राय व प्रसिद्धी फॉर्म", feedbackInboxDesc: "सार्वजनिक फॉर्ममधील प्रतिसाद — पुनरावलोकन करून निर्देशिकेत विलीन करा.",
    shareForm: "फॉर्म शेअर करा", markReviewed: "पुनरावलोकन झाले म्हणून चिन्हांकित करा", mergeIntoDirectory: "निर्देशिकेत विलीन करा",
    new_: "नवीन", reviewed: "पुनरावलोकन झाले", merged: "विलीन झाले",
    registrationsTitle: "नवीन ग्रामपंचायत नोंदणी",
    registrationsDesc: "संपूर्ण नोंदणी सादरीकरणे — कार्यालयीन तपशील, संपर्क आणि स्थानिक कर दर — ग्रामपंचायत नोंद बनण्यास तयार.",
    viewFullDetails: "कार्यालयीन तपशील व कर दर पहा", hideFullDetails: "संपूर्ण तपशील लपवा",

    approvalsTitle: "मंजुरी प्रलंबित", approvalsDesc: "कर्मचाऱ्यांनी फील्डमध्ये जोडलेले किंवा दुरुस्त केलेले संपर्क तपशील, निर्देशिका अद्ययावत होण्याआधी तुमच्या पुनरावलोकनाच्या प्रतीक्षेत.",
    pending: "प्रलंबित", approved: "मंजूर", rejected: "नाकारले",
    approve: "मंजूर करा", reject: "नाकारा", newContactLabel: "नवीन संपर्क", updateToExisting: "अस्तित्वातील संपर्कात बदल",
    proposedBy: "सुचवले", viewCurrentRecord: "सध्याची नोंद पहा", noRequestsFound: "कोणतेही",

    employeesTitle: "कर्मचारी", employeesDesc: "तुमच्या फील्ड टीमसाठी खाती तयार करा आणि भूमिका व्यवस्थापित करा.",
    addEmployee: "कर्मचारी जोडा", noEmployeesYet: "अजून कोणतेही कर्मचारी नाहीत", active: "सक्रिय", inactive: "निष्क्रिय",
    role: "भूमिका", team: "टीम", sales: "विक्री", support: "सहाय्य", temporaryPassword: "तात्पुरता पासवर्ड",
    backToEmployees: "कर्मचाऱ्यांकडे परत जा", totalLogs: "एकूण नोंदी", firstLogged: "पहिली नोंद", dailyLogSection: "दैनंदिन नोंद",
    noLogEntriesInRange: "या कालावधीत कोणत्याही नोंदी नाहीत",

    configuration: "सेटिंग्ज व्यवस्थापन", settingsTitle: "सेटिंग्ज", settingsDesc: "तुमची टीम आणि सार्वजनिक फॉर्म काय विचारतो ते व्यवस्थापित करा.",
    activityTypesLabel: "कामाचे प्रकार", activityFieldsLabel: "दैनंदिन नोंद फॉर्म फील्ड", feedbackFieldsLabel: "अभिप्राय फॉर्म फील्ड",
    registrationFieldsLabel: "नोंदणी फॉर्म फील्ड", addType: "प्रकार जोडा", addField: "फील्ड जोडा",
    noCustomFieldsYet: "अजून कोणतेही सानुकूल फील्ड नाहीत.", fieldKey: "की (जागा नकोत)", fieldLabel: "वापरकर्त्याला दिसणारे लेबल",
    fieldType: "फील्ड प्रकार", fieldOptions: "पर्याय (स्वल्पविरामाने वेगळे करा)",

    importTitle: "स्प्रेडशीट आयात करा",
    importDesc: "ग्रामपंचायती आणि संपर्कांची Excel किंवा CSV शीट अपलोड करा. अस्तित्वातील नोंदी जुळवून अद्ययावत केल्या जातात, डुप्लिकेट होत नाहीत.",
    chooseFileOrDrag: "फाईल निवडण्यासाठी क्लिक करा, किंवा येथे ड्रॅग करा", import: "आयात करा", importing: "आयात करत आहे…",
    importSummary: "आयात सारांश", expectedColumns: "अपेक्षित स्तंभ शीर्षके",

    signInTitle: "तुमच्या ऑपरेशन्स कन्सोलमध्ये साइन इन करा", signIn: "साइन इन करा", signingIn: "साइन इन करत आहे…",
    accountsCreatedByAdmin: "खाती प्रशासकाद्वारे सेटिंग्ज → कर्मचारी येथून तयार केली जातात.",
  },
};
