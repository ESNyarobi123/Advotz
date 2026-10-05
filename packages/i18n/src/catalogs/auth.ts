/**
 * Authentication surfaces: register, log in, the social buttons and the
 * marketing showcase panel beside the forms.
 *
 * English is the source of truth: `sw` is typed against `authEn`, so a key
 * added here without a Swahili entry fails the build.
 */
export const authEn = {
  // ── Shared auth chrome ───────────────────────────────────────────────────
  "auth.common.home": "Home",
  "auth.common.backToMainSite": "Back to main site",
  "auth.common.optional": "Optional",
  "auth.common.footerTagline": "Secure platform for selling WiFi in Tanzania",
  "auth.field.emailPlaceholder": "example@business.tz",

  // ── Register · shell ─────────────────────────────────────────────────────
  "auth.register.badgeReseller": "Open a business account",
  "auth.register.badgeAgent": "Sales agent program",
  "auth.register.titleReseller": "Register your WiFi business",
  "auth.register.titleAgent": "Register as a sales agent",
  "auth.register.subtitleReseller":
    "Start selling internet with instant mobile money payments (M-Pesa, Tigo Pesa, Airtel Money).",
  "auth.register.subtitleAgent":
    "Connect WiFi businesses and earn a recurring monthly commission for every customer you bring.",
  "auth.register.tabReseller": "Service seller (Reseller)",
  "auth.register.tabAgent": "Sales agent (Agent)",
  "auth.register.agentOrDetails": "or fill in your agent details",

  // ── Register · fields ────────────────────────────────────────────────────
  "auth.register.fullNameLabel": "Your full name",
  "auth.register.fullNamePlaceholder": "e.g. Juma Bakari",
  "auth.register.agentEmailPlaceholder": "e.g. juma@agent.co.tz",
  "auth.register.referralLabel": "Preferred referral code",
  "auth.register.referralPlaceholder": "e.g. JUMA2026 (uppercase letters or numbers)",
  "auth.register.referralHint":
    "Your customers will use this code to sign up and earn you a monthly commission.",
  "auth.register.referralCodePlaceholder": "Example: AGENT123",
  "auth.register.referralBonusHint":
    "If an Advo TZ technician or agent invited you, enter their code here so they get a bonus.",
  "auth.register.businessNameLabel": "Business / WiFi hotspot name",
  "auth.register.businessNamePlaceholder": "Example: Sunset Lounge & Cafe",
  "auth.register.businessNameHint":
    "This name will appear at the top of your customers' page (Captive Portal).",
  "auth.register.venueTypeLabel": "Business type",
  "auth.register.venue.cafe": "Restaurant / Cafe",
  "auth.register.venue.hotel": "Hotel / Lodge",
  "auth.register.venue.hostel": "Hostel / Campus",
  "auth.register.venue.wisp": "Neighborhood WISP",
  "auth.register.venueOption.cafe": "Restaurant, coffee shop or bar",
  "auth.register.venueOption.hotel": "Hotel, resort or lodge",
  "auth.register.venueOption.hostel": "Hostel or student residence",
  "auth.register.venueOption.wisp": "WISP / neighborhood internet provider",
  "auth.register.venueOption.salon": "Salon, shop or mall",
  "auth.register.venueOption.other": "Other business",
  "auth.register.cityLabel": "Region / business location",
  "auth.register.city.dar": "Dar es Salaam (Kariakoo, Masaki, Mikocheni, Sinza...)",
  "auth.register.city.arusha": "Arusha (Mjini, Njiro, Sakina...)",
  "auth.register.city.zanzibar": "Zanzibar (Stone Town, Nungwi, Paje...)",
  "auth.register.city.mwanza": "Mwanza",
  "auth.register.city.dodoma": "Dodoma (Kikuyu, Msalato...)",
  "auth.register.city.mbeya": "Mbeya",
  "auth.register.city.morogoro": "Morogoro",
  "auth.register.city.tanga": "Tanga",
  "auth.register.city.kilimanjaro": "Kilimanjaro / Moshi",
  "auth.register.city.other": "Other region",
  "auth.register.deviceTypeLabel": "Your device type",
  "auth.register.deviceType.ap": "Access Point (AP)",
  "auth.register.deviceType.gateway": "Gateway / Router",
  "auth.register.deviceType.switch": "Switch",
  "auth.register.deviceType.repeater": "Repeater / Extender",
  "auth.register.ownerNamePlaceholder": "Example: John Daudi",

  // ── Register · terms, steps & actions ────────────────────────────────────
  "auth.register.stepAccount": "Account",
  "auth.register.stepBusiness": "Business",
  "auth.register.stepDeviceType": "Device type",
  "auth.register.socialPrompt": "Sign up quickly with:",
  "auth.register.agentTermsLead": "I accept the",
  "auth.register.agentTermsLink": "Agent Terms & Conditions",
  "auth.register.termsAnd": "and",
  "auth.register.termsPrivacy": "Privacy Policy",
  "auth.register.agentTermsTrail": "for Advo TZ.",
  "auth.register.termsLead": "I agree to the",
  "auth.register.termsService": "Terms of Service",
  "auth.register.termsTrail": "of the Advo TZ platform.",
  "auth.register.guaranteeTitle": "Free guarantee:",
  "auth.register.guaranteeBody":
    "No joining fee. You get a 14-day trial with no contract charges.",
  "auth.register.next": "Continue to the next step",
  "auth.register.submitPending": "Finishing registration…",
  "auth.register.submit": "Complete business registration",
  "auth.register.agentSubmitPending": "Creating your agent account…",
  "auth.register.agentSubmit": "Complete agent registration",
  "auth.register.haveAccount": "Already have an Advo TZ account?",
  "auth.register.loginLink": "Log in here",

  // ── Register · validation & feedback ─────────────────────────────────────
  "auth.register.error.fullName": "Please enter your full name.",
  "auth.register.error.email": "Please enter a valid email address.",
  "auth.register.error.phone": "Please enter a complete phone number starting with +255.",
  "auth.register.error.password": "Password must be at least 10 characters or digits.",
  "auth.register.error.businessName": "Please enter your business or WiFi network name.",
  "auth.register.error.terms": "You must accept the terms and conditions before registering.",
  "auth.register.error.agentTerms":
    "You must accept the terms and conditions before joining as an agent.",
  "auth.register.error.registrationFailed": "Registration failed",
  "auth.register.error.agentFailed": "Agent registration failed",
  "auth.register.info.devToken":
    "Registered. Dev verification token: {token} (fake notification transport)",
  "auth.register.info.checkEmail":
    "Registered. Check your email to verify (when a real provider is configured).",
  "auth.register.info.agentEmail":
    "Your agent account is open. Please verify your email.",

  // ── Log in ───────────────────────────────────────────────────────────────
  "auth.login.badge": "Advo Portal Access",
  "auth.login.title": "Log in to your account",
  "auth.login.titleMfa": "Two-step verification",
  "auth.login.subtitle":
    "Welcome back to your WiFi management and earnings system.",
  "auth.login.subtitleMfa":
    "Enter the 6-digit code from your authenticator app.",
  "auth.login.forgot": "Forgot your password?",
  "auth.login.mfaBadge": "Security verification (Two-Factor TOTP)",
  "auth.login.mfaCodeLabel": "Authenticator code",
  "auth.login.mfaHint":
    "Open Google Authenticator or your TOTP app and enter the 6 digits shown.",
  "auth.login.remember": "Remember this device for 30 days",
  "auth.login.verifying": "Verifying…",
  "auth.login.verifyAndLogin": "Verify and log in",
  "auth.login.noAccount": "Don't have a WiFi account yet?",
  "auth.login.registerLink": "Register your business for free",
  "auth.login.sslNote": "Strong data protection with 256-bit SSL encryption",

  // ── Showcase panel ───────────────────────────────────────────────────────
  "auth.showcase.cloudBadge": "Tanzania WiFi Cloud",
  "auth.showcase.loginTitleLead": "Welcome back to the heart of",
  "auth.showcase.loginTitleAccent": "your WiFi revenue",
  "auth.showcase.loginTitleTrail": ".",
  "auth.showcase.registerTitleLead": "Turn your WiFi into",
  "auth.showcase.registerTitleAccent": "a money-making machine",
  "auth.showcase.registerTitleTrail": "in just 5 minutes.",
  "auth.showcase.loginBody":
    "Manage your customers, watch live M-Pesa and Tigo Pesa transactions, and run your TP-Link Omada devices with top-tier security.",
  "auth.showcase.registerBody":
    "Connect your TP-Link Omada router, create packages at your own prices, and receive customer payments instantly into your bank or mobile money account.",
  "auth.showcase.feature1.title": "Instant mobile money payments (USSD Push)",
  "auth.showcase.feature1.body":
    "M-Pesa, Tigo Pesa, Airtel Money and Halopesa arrive directly without the customer typing a long number.",
  "auth.showcase.feature2.title": "Full TP-Link Omada integration",
  "auth.showcase.feature2.body":
    "Works flawlessly with OC200, OC300, Software Controller and Cloud Controller.",
  "auth.showcase.feature3.title": "Double-entry financial ledger",
  "auth.showcase.feature3.body":
    "Every shilling is accounted for with bank-grade accuracy. No money is lost or mismatched.",
  "auth.showcase.verifiedNetwork": "Verified network",
  "auth.showcase.testimonialQuote":
    "Since we connected Advo TZ to our TP-Link Omada routers, our restaurant customers pay for internet in seconds via M-Pesa. It's the first system in Tanzania to work this professionally!",
  "auth.showcase.testimonialAuthor":
    "Juma K., hotspot owner (Sinza & Mikocheni, Dar es Salaam)",
  "auth.showcase.hotspots": "350+ hotspots live",
  "auth.showcase.uptime": "Uptime: 99.98%",
  "auth.showcase.instantPayments": "Instant payments: TZS",

  // ── Social sign-in ───────────────────────────────────────────────────────
  "auth.social.signInWith": "Sign in with your {provider} account",
  "auth.social.comingSoon":
    "Sign-in with {provider} is being prepared and will be enabled soon! For now you can continue with your email below.",
  "auth.social.continueWithEmail": "or continue with email",
  "auth.social.badge.fast": "Quick",
  "auth.social.badge.secure": "Secure",
  "auth.social.badge.popular": "Popular",
  "auth.social.badge.media": "Media",

  // ── Password field ───────────────────────────────────────────────────────
  "auth.password.minLength": "Password (at least 10 characters)",
  "auth.password.show": "Show password",
  "auth.password.hide": "Hide password",
} as const;

export type AuthKey = keyof typeof authEn;

export const authSw: Record<AuthKey, string> = {
  // ── Shared auth chrome ───────────────────────────────────────────────────
  "auth.common.home": "Nyumbani",
  "auth.common.backToMainSite": "Rudi kwenye Tovuti Kuu",
  "auth.common.optional": "Hiari",
  "auth.common.footerTagline": "Mfumo Salama wa Kuuza WiFi Tanzania",
  "auth.field.emailPlaceholder": "mfano@biashara.tz",

  // ── Register · shell ─────────────────────────────────────────────────────
  "auth.register.badgeReseller": "Fungua Akaunti ya Biashara",
  "auth.register.badgeAgent": "Mpango wa Mawakala wa Mauzo",
  "auth.register.titleReseller": "Sajili Biashara Yako ya WiFi",
  "auth.register.titleAgent": "Sajili Kama Wakala wa Mauzo",
  "auth.register.subtitleReseller":
    "Anza kuuza internet kwa malipo ya papo hapo ya simu ya mkononi (M-Pesa, Tigo Pesa, Airtel Money).",
  "auth.register.subtitleAgent":
    "Unganisha biashara za WiFi na upate kamisheni ya kudumu ya kila mwezi kwa kila mteja unayemleta.",
  "auth.register.tabReseller": "Muuza Huduma (Reseller)",
  "auth.register.tabAgent": "Wakala wa Mauzo (Agent)",
  "auth.register.agentOrDetails": "au jaza taarifa zako za uwakala",

  // ── Register · fields ────────────────────────────────────────────────────
  "auth.register.fullNameLabel": "Jina Lako Kamili",
  "auth.register.fullNamePlaceholder": "mf. Juma Bakari",
  "auth.register.agentEmailPlaceholder": "mf. juma@wakala.co.tz",
  "auth.register.referralLabel": "Kodi Maalum ya Rufaa",
  "auth.register.referralPlaceholder": "mf. JUMA2026 (herufi kubwa au namba)",
  "auth.register.referralHint":
    "Wateja wako watatumia kodi hii kujiandikisha na kukuingizia kamisheni ya kila mwezi.",
  "auth.register.referralCodePlaceholder": "Mfano: AGENT123",
  "auth.register.referralBonusHint":
    "Kama ulialikwa na fundi au wakala wa Advo TZ, weka kodi yake hapa ili apate bonasi.",
  "auth.register.businessNameLabel": "Jina la Biashara / Hotspot WiFi",
  "auth.register.businessNamePlaceholder": "Mfano: Sunset Lounge & Cafe",
  "auth.register.businessNameHint":
    "Jina hili litaonekana juu ya ukurasa wa wateja wako (Captive Portal).",
  "auth.register.venueTypeLabel": "Aina ya Biashara",
  "auth.register.venue.cafe": "Mgahawa / Cafe",
  "auth.register.venue.hotel": "Hoteli / Lodge",
  "auth.register.venue.hostel": "Hosteli / Chuo",
  "auth.register.venue.wisp": "WISP Mtaani",
  "auth.register.venueOption.cafe": "Mgahawa, Coffee Shop au Bar",
  "auth.register.venueOption.hotel": "Hoteli, Resort au Lodge",
  "auth.register.venueOption.hostel": "Hosteli au Makazi ya Wanafunzi",
  "auth.register.venueOption.wisp": "WISP / Mtoa Huduma ya Internet Mtaani",
  "auth.register.venueOption.salon": "Saluni, Duka au Mall",
  "auth.register.venueOption.other": "Biashara Nyingine",
  "auth.register.cityLabel": "Mkoa / Eneo la Biashara",
  "auth.register.city.dar": "Dar es Salaam (Kariakoo, Masaki, Mikocheni, Sinza...)",
  "auth.register.city.arusha": "Arusha (Mjini, Njiro, Sakina...)",
  "auth.register.city.zanzibar": "Zanzibar (Stone Town, Nungwi, Paje...)",
  "auth.register.city.mwanza": "Mwanza",
  "auth.register.city.dodoma": "Dodoma (Kikuyu, Msalato...)",
  "auth.register.city.mbeya": "Mbeya",
  "auth.register.city.morogoro": "Morogoro",
  "auth.register.city.tanga": "Tanga",
  "auth.register.city.kilimanjaro": "Kilimanjaro / Moshi",
  "auth.register.city.other": "Mkoa Mwingine",
  "auth.register.deviceTypeLabel": "Aina ya kifaa chako",
  "auth.register.deviceType.ap": "Access Point (AP)",
  "auth.register.deviceType.gateway": "Gateway / Router",
  "auth.register.deviceType.switch": "Switch",
  "auth.register.deviceType.repeater": "Repeater / Extender",
  "auth.register.ownerNamePlaceholder": "Mfano: John Daudi",

  // ── Register · terms, steps & actions ────────────────────────────────────
  "auth.register.stepAccount": "Akaunti",
  "auth.register.stepBusiness": "Biashara",
  "auth.register.stepDeviceType": "Aina ya kifaa",
  "auth.register.socialPrompt": "Jisajili haraka kwa mitandao:",
  "auth.register.agentTermsLead": "Ninakubali",
  "auth.register.agentTermsLink": "Vigezo na Masharti ya Mawakala",
  "auth.register.termsAnd": "na",
  "auth.register.termsPrivacy": "Sera ya Faragha",
  "auth.register.agentTermsTrail": "ya Advo TZ.",
  "auth.register.termsLead": "Ninakubaliana na",
  "auth.register.termsService": "Masharti ya Huduma",
  "auth.register.termsTrail": "ya mfumo wa Advo TZ.",
  "auth.register.guaranteeTitle": "Dhamana ya Bure:",
  "auth.register.guaranteeBody":
    "Hakuna ada ya kujiunga. Una siku 14 za majaribio bila malipo yoyote ya mkataba.",
  "auth.register.next": "Endelea Hatua Inayofuata",
  "auth.register.submitPending": "Inakamilisha Usajili…",
  "auth.register.submit": "Kamilisha Usajili wa Biashara",
  "auth.register.agentSubmitPending": "Inafungua Akaunti ya Wakala…",
  "auth.register.agentSubmit": "Kamilisha Usajili wa Wakala",
  "auth.register.haveAccount": "Tayari una akaunti ya Advo TZ?",
  "auth.register.loginLink": "Ingia Hapa",

  // ── Register · validation & feedback ─────────────────────────────────────
  "auth.register.error.fullName": "Tafadhali ingiza jina lako kamili.",
  "auth.register.error.email": "Tafadhali ingiza barua pepe sahihi.",
  "auth.register.error.phone": "Tafadhali ingiza namba kamili ya simu kuanzia +255.",
  "auth.register.error.password": "Nenosiri lazima liwe na angalau herufi au tarakimu 10.",
  "auth.register.error.businessName": "Tafadhali ingiza jina la biashara au mtandao wako wa WiFi.",
  "auth.register.error.terms": "Lazima ukubaliane na vigezo na masharti kabla ya kujisajili.",
  "auth.register.error.agentTerms":
    "Lazima ukubaliane na vigezo na masharti kabla ya kujiunga kama Wakala.",
  "auth.register.error.registrationFailed": "Usajili umeshindikana",
  "auth.register.error.agentFailed": "Usajili wa Wakala umeshindikana",
  "auth.register.info.devToken":
    "Usajili umekamilika. Token ya uthibitisho ya dev: {token} (usafirishaji wa arifa wa majaribio)",
  "auth.register.info.checkEmail":
    "Usajili umekamilika. Angalia barua pepe yako ili kuthibitisha (mtoa huduma halisi anaposanidiwa).",
  "auth.register.info.agentEmail":
    "Akaunti ya Wakala imefunguliwa. Tafadhali thibitisha barua pepe yako.",

  // ── Log in ───────────────────────────────────────────────────────────────
  "auth.login.badge": "Ufikiaji wa Portal ya Advo",
  "auth.login.title": "Ingia Kwenye Akaunti Yako",
  "auth.login.titleMfa": "Uthibitisho wa Hatua ya 2",
  "auth.login.subtitle":
    "Karibu tena kwenye mfumo wako wa usimamizi wa WiFi na mapato.",
  "auth.login.subtitleMfa":
    "Weka kodi ya nambari 6 kutoka kwenye programu yako ya kithibitishi (Authenticator).",
  "auth.login.forgot": "Umesahau nenosiri?",
  "auth.login.mfaBadge": "Uthibitisho wa Usalama (Two-Factor TOTP)",
  "auth.login.mfaCodeLabel": "Kodi ya kithibitishaji",
  "auth.login.mfaHint":
    "Fungua Google Authenticator au app yako ya TOTP na uingize tarakimu 6 zilizopo.",
  "auth.login.remember": "Kumbuka kifaa hiki kwa siku 30",
  "auth.login.verifying": "Inathibitisha…",
  "auth.login.verifyAndLogin": "Thibitisha na uingie",
  "auth.login.noAccount": "Huna akaunti ya WiFi bado?",
  "auth.login.registerLink": "Sajili Biashara Yako Bure",
  "auth.login.sslNote": "Ulinzi thabiti wa data na usimbaji fiche wa 256-bit SSL",

  // ── Showcase panel ───────────────────────────────────────────────────────
  "auth.showcase.cloudBadge": "Wingu la WiFi Tanzania",
  "auth.showcase.loginTitleLead": "Karibu tena kwenye kitovu cha",
  "auth.showcase.loginTitleAccent": "mapato ya WiFi yako",
  "auth.showcase.loginTitleTrail": ".",
  "auth.showcase.registerTitleLead": "Badili WiFi yako kuwa",
  "auth.showcase.registerTitleAccent": "mashine ya mapato",
  "auth.showcase.registerTitleTrail": "ndani ya dakika 5.",
  "auth.showcase.loginBody":
    "Dhibiti wateja wako, angalia miamala ya moja kwa moja ya M-Pesa na Tigo Pesa, na simamia vifaa vya TP-Link Omada kwa usalama wa hali ya juu.",
  "auth.showcase.registerBody":
    "Unganisha TP-Link Omada router yako, tengeneza vifurushi vya bei zako mwenyewe, na pokea malipo ya wateja papo hapo kwenye akaunti yako ya benki au simu.",
  "auth.showcase.feature1.title": "Malipo ya Papo Hapo ya Simu (USSD Push)",
  "auth.showcase.feature1.body":
    "M-Pesa, Tigo Pesa, Airtel Money na Halopesa zinaingia moja kwa moja bila mteja kuhitaji kuandika namba ngumu.",
  "auth.showcase.feature2.title": "Ushirikiano Kamili na TP-Link Omada",
  "auth.showcase.feature2.body":
    "Inafanya kazi bila hitilafu na OC200, OC300, Software Controller na Cloud Controller.",
  "auth.showcase.feature3.title": "Leja ya fedha ya kuingiza mara mbili",
  "auth.showcase.feature3.body":
    "Kila shilingi inahesabiwa kwa usahihi wa kiwango cha kibenki. Hakuna pesa inayopotea au kutofautiana.",
  "auth.showcase.verifiedNetwork": "Mtandao Uliothibitishwa",
  "auth.showcase.testimonialQuote":
    "Tangu tuunganishe Advo TZ na router zetu za TP-Link Omada, wateja wetu wa mgahawa wanalipia internet kwa sekunde chache kupitia M-Pesa. Ni mfumo wa kwanza Tanzania unaofanya kazi kwa weledi huu!",
  "auth.showcase.testimonialAuthor":
    "Juma K., Mmiliki wa Hotspot (Sinza & Mikocheni, Dar es Salaam)",
  "auth.showcase.hotspots": "Hotspots 350+ ziko hewani",
  "auth.showcase.uptime": "Uptime: 99.98%",
  "auth.showcase.instantPayments": "Malipo ya Papo Hapo: TZS",

  // ── Social sign-in ───────────────────────────────────────────────────────
  "auth.social.signInWith": "Ingia na akaunti yako ya {provider}",
  "auth.social.comingSoon":
    "Huduma ya kuingia na {provider} inatayarishwa na itawashwa hivi karibuni! Kwa sasa unaweza kuendelea kwa kutumia barua pepe yako hapa chini.",
  "auth.social.continueWithEmail": "au endelea na barua pepe",
  "auth.social.badge.fast": "Haraka",
  "auth.social.badge.secure": "Salama",
  "auth.social.badge.popular": "Maarufu",
  "auth.social.badge.media": "Media",

  // ── Password field ───────────────────────────────────────────────────────
  "auth.password.minLength": "Nenosiri (Angalau herufi 10)",
  "auth.password.show": "Onyesha nenosiri",
  "auth.password.hide": "Ficha nenosiri",
};

export const authCatalog = { en: authEn, sw: authSw };
