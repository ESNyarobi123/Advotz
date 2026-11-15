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
  "auth.register.stepVerify": "Verify",
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
    "No joining fee. Your plan starts with a free trial and no contract charges, and you can cancel any time.",
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
  "auth.register.info.readyToLogin":
    "Your account is ready. Sign in with the email and password you just created.",
  "auth.register.info.agentEmail":
    "Your agent account is open. Please verify your email.",

  // ── Register · email verification (OTP) ─────────────────────────────────
  "auth.otp.stepTitle": "Verify your email",
  "auth.otp.resellerBody":
    "We will send a one-time code to your email. Enter it here to prove the address is yours before your business account is created.",
  "auth.otp.agentBody":
    "We will send a one-time code to your email. Verify it before your agent account is created.",
  "auth.otp.emailHint": "The code goes to {email}.",
  "auth.otp.codeLabel": "6-digit verification code",
  "auth.otp.codePlaceholder": "123456",
  "auth.otp.send": "Send verification code",
  "auth.otp.sending": "Sending code…",
  "auth.otp.resend": "Resend code",
  "auth.otp.cooldown": "You can resend in {seconds}s",
  "auth.otp.verify": "Verify code",
  "auth.otp.verifying": "Verifying…",
  "auth.otp.verified": "Email verified",
  "auth.otp.verifiedBody": "Your email is confirmed. Finish creating your account below.",
  "auth.otp.sent": "Code sent to {email}.",
  "auth.otp.expires": "The code expires in {minutes} minutes.",
  "auth.otp.error": "Enter the 6-digit code from your email.",
  "auth.otp.sendFirst": "Send a verification code first.",
  "auth.otp.required": "Verify your email before continuing.",
  "auth.otp.changeEmail": "Use a different email",
  "auth.otp.securityNote":
    "Never share this code. Advo TZ staff will never ask you for it.",
  "auth.otp.devCode": "Test mode code: {code}",

  // ── Password reset ───────────────────────────────────────────────────────
  "auth.forgot.badge": "Account recovery",
  "auth.forgot.title": "Reset your password",
  "auth.forgot.subtitle":
    "Enter your account email and we will send a 6-digit code. The code proves the mailbox is yours before the password changes.",
  "auth.forgot.stepEmail": "Email",
  "auth.forgot.stepCode": "Code",
  "auth.forgot.stepPassword": "New password",
  "auth.forgot.emailLabel": "Account email",
  "auth.forgot.sendCode": "Send reset code",
  "auth.forgot.sending": "Sending code…",
  "auth.forgot.sent":
    "If an account exists for {email}, a reset code is on its way. Check the inbox and spam folder.",
  "auth.forgot.codeTitle": "Enter the code",
  "auth.forgot.codeBody": "Enter the 6-digit code sent to {email}.",
  "auth.forgot.codeLabel": "Verification code",
  "auth.forgot.verify": "Verify code",
  "auth.forgot.verifying": "Verifying…",
  "auth.forgot.resend": "Resend code",
  "auth.forgot.cooldown": "Resend in {seconds}s",
  "auth.forgot.expireHint":
    "Codes and reset links expire quickly. If yours has expired, start again.",
  "auth.forgot.passwordTitle": "Choose a new password",
  "auth.forgot.passwordBody": "Use at least 10 characters. All other devices will be signed out.",
  "auth.forgot.newPassword": "New password",
  "auth.forgot.confirmPassword": "Confirm new password",
  "auth.forgot.reset": "Reset password",
  "auth.forgot.resetting": "Resetting…",
  "auth.forgot.success":
    "Your password has been reset. Sign in with your new password.",
  "auth.forgot.mismatch": "The two passwords do not match.",
  "auth.forgot.tooShort": "Password must be at least 10 characters.",
  "auth.forgot.changeEmail": "Use a different email",
  "auth.forgot.backToLogin": "Back to sign in",
  "auth.forgot.devCode": "Test mode code: {code}",
  "auth.forgot.verifiedNote": "Code verified. Choose your new password now.",
  "auth.forgot.invalidCode": "That code was not accepted. Check it and try again.",

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

  // ── Auth refresh · steps, fields, trust ──────────────────────────────────
  "auth.stepper.position": "Step {current} of {total}",
  "auth.password.rule.length": "10+ characters",
  "auth.password.rule.mix": "Letters & numbers",
  "auth.password.rule.case": "Upper & lower case",
  "auth.password.rule.symbol": "A symbol",
  "auth.password.level.weak": "Weak",
  "auth.password.level.fair": "Fair",
  "auth.password.level.good": "Good",
  "auth.password.level.strong": "Strong",
  "auth.otp.requiredBadge": "Required",
  "auth.register.type.resellerTitle": "WiFi business",
  "auth.register.type.resellerBody": "Sell internet to your own customers.",
  "auth.register.type.agentTitle": "Sales agent",
  "auth.register.type.agentBody": "Refer businesses and earn commission.",
  "auth.register.step1.title": "Your account",
  "auth.register.step1.body":
    "Use an email you check daily — your login and security alerts go there.",
  "auth.register.step2.title": "Your business",
  "auth.register.step2.body":
    "This is what customers see when they buy WiFi from you.",
  "auth.register.step3.title": "Confirm and verify",
  "auth.register.step3.body": "Check the details, then prove the email is yours.",
  "auth.register.emailHint": "Your verification code goes to this address.",
  "auth.register.phoneHint": "Tanzanian number. 0712… is stored as +255712…",
  "auth.register.slugPreview": "Your WiFi page",
  "auth.register.slugNote": "A short code is added at the end so the address stays unique.",
  "auth.register.referralValid": "Code format looks right",
  "auth.register.error.referral":
    "Referral codes are 4–24 characters: letters, numbers, - or _.",
  "auth.register.summary.title": "Review your details",
  "auth.register.summary.edit": "Edit",
  "auth.register.nextSteps.title": "What happens next",
  "auth.register.nextSteps.plan": "Pick a plan",
  "auth.register.nextSteps.site": "Create a site",
  "auth.register.nextSteps.device": "Connect the router",
  "auth.register.agent.benefit.commission.title": "Recurring commission",
  "auth.register.agent.benefit.dashboard.title": "Live dashboard",
  "auth.register.agent.benefit.code.title": "Your own code",
  "auth.register.trust.free": "No setup fee",
  "auth.register.trust.minutes": "Live in about 5 minutes",
  "auth.register.trust.secure": "Bank-grade encryption",
  "auth.login.socialPrompt": "Sign in quickly with:",
  "auth.login.useAnother": "Use another account",
  "auth.register.timeHint": "Takes about 2 minutes",
  "auth.login.trust.secure": "Encrypted session",
  "auth.login.trust.mfa": "Two-factor ready",

  // ── Google sign-in ───────────────────────────────────────────────────────
  "auth.social.continueWithGoogle": "Continue with Google",
  "auth.social.connectingGoogle": "Opening Google…",
  "auth.social.recommended": "Fastest",
  "auth.social.soon": "Soon",
  "auth.google.badge": "Google verified",
  "auth.google.title": "One last step",
  "auth.google.body":
    "Google already confirmed your email. Tell us how you will use Advo so we can open the right account.",
  "auth.google.accountType": "Account type",
  "auth.google.phoneHint": "Customers and support reach you on this number.",
  "auth.google.submit": "Create my account",
  "auth.google.submitPending": "Creating your account…",
  "auth.google.switchAccount": "Switch",
  "auth.google.notYou": "Not your account?",
  "auth.google.useAnother": "Use a different Google account",
  "auth.google.missing.title": "This Google sign-up has expired",
  "auth.google.missing.body":
    "For your safety the link only works for a few minutes. Start again and Google will take you straight back here.",
  "auth.google.missing.action": "Start again",
  "auth.google.error.cancelled": "Google sign-in was cancelled. Nothing was changed.",
  "auth.google.error.expired": "That Google sign-in took too long. Please try again.",
  "auth.google.error.unavailable":
    "Google sign-in is not switched on yet. Use your email and password for now.",
  "auth.google.error.failed": "Google could not finish the sign-in. Please try again.",
  "auth.google.error.notAllowed": "This account cannot sign in with Google. Use your password instead.",
  "auth.google.error.notVerified":
    "Google has not verified this email address. Use your email and password instead.",
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
  "auth.register.stepVerify": "Thibitisha",
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
    "Hakuna ada ya kujiunga. Mpango wako huanza na jaribio la bure bila gharama za mkataba, na unaweza kuacha wakati wowote.",
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
  "auth.register.info.readyToLogin":
    "Akaunti yako iko tayari. Ingia kwa barua pepe na nenosiri ulivyoweka sasa hivi.",
  "auth.register.info.agentEmail":
    "Akaunti ya Wakala imefunguliwa. Tafadhali thibitisha barua pepe yako.",

  // ── Register · email verification (OTP) ─────────────────────────────────
  "auth.otp.stepTitle": "Thibitisha Barua Pepe Yako",
  "auth.otp.resellerBody":
    "Tutatuma kodi ya mara moja kwenye barua pepe yako. Iandike hapa kuthibitisha kuwa barua pepe ni yako kabla akaunti ya biashara haijaundwa.",
  "auth.otp.agentBody":
    "Tutatuma kodi ya mara moja kwenye barua pepe yako. Ithibishe kabla akaunti ya wakala haijaundwa.",
  "auth.otp.emailHint": "Kodi itatumwa kwa {email}.",
  "auth.otp.codeLabel": "Kodi ya uthibitisho ya tarakimu 6",
  "auth.otp.codePlaceholder": "123456",
  "auth.otp.send": "Tuma Kodi ya Uthibitisho",
  "auth.otp.sending": "Inatuma kodi…",
  "auth.otp.resend": "Tuma Kodi Tena",
  "auth.otp.cooldown": "Unaweza kutuma tena baada ya sekunde {seconds}",
  "auth.otp.verify": "Thibitisha Kodi",
  "auth.otp.verifying": "Inathibitisha…",
  "auth.otp.verified": "Barua pepe imethibitishwa",
  "auth.otp.verifiedBody": "Barua pepe yako imethibitishwa. Kamilisha kuunda akaunti yako hapa chini.",
  "auth.otp.sent": "Kodi imetumwa kwa {email}.",
  "auth.otp.expires": "Kodi itaisha muda wake baada ya dakika {minutes}.",
  "auth.otp.error": "Weka kodi ya tarakimu 6 kutoka kwenye barua pepe yako.",
  "auth.otp.sendFirst": "Tuma kodi ya uthibitisho kwanza.",
  "auth.otp.required": "Thibitisha barua pepe yako kabla ya kuendelea.",
  "auth.otp.changeEmail": "Tumia barua pepe nyingine",
  "auth.otp.securityNote":
    "Usimpe mtu yeyote kodi hii. Wafanyakazi wa Advo TZ hawatakuomba kodi hii.",
  "auth.otp.devCode": "Kodi ya hali ya majaribio: {code}",

  // ── Password reset ───────────────────────────────────────────────────────
  "auth.forgot.badge": "Kurejesha Akaunti",
  "auth.forgot.title": "Weka Nenosiri Jipya",
  "auth.forgot.subtitle":
    "Weka barua pepe ya akaunti yako na tutakutumia kodi ya tarakimu 6. Kodi hiyo inathibitisha kuwa barua pepe ni yako kabla nenosiri halibadiliki.",
  "auth.forgot.stepEmail": "Barua pepe",
  "auth.forgot.stepCode": "Kodi",
  "auth.forgot.stepPassword": "Nenosiri jipya",
  "auth.forgot.emailLabel": "Barua pepe ya akaunti",
  "auth.forgot.sendCode": "Tuma Kodi ya Kurejesha",
  "auth.forgot.sending": "Inatuma kodi…",
  "auth.forgot.sent":
    "Kama akaunti ipo kwa {email}, kodi ya kurejesha iko njiani. Angalia kikasha na folda ya spam.",
  "auth.forgot.codeTitle": "Weka Kodi",
  "auth.forgot.codeBody": "Weka kodi ya tarakimu 6 iliyotumwa kwa {email}.",
  "auth.forgot.codeLabel": "Kodi ya uthibitisho",
  "auth.forgot.verify": "Thibitisha Kodi",
  "auth.forgot.verifying": "Inathibitisha…",
  "auth.forgot.resend": "Tuma Kodi Tena",
  "auth.forgot.cooldown": "Tuma tena baada ya sekunde {seconds}",
  "auth.forgot.expireHint":
    "Kodi na viungo vya kurejesha vinaisha muda haraka. Kama vimeisha, anza tena.",
  "auth.forgot.passwordTitle": "Chagua Nenosiri Jipya",
  "auth.forgot.passwordBody": "Tumia angalau herufi 10. Vifaa vingine vyote vitatolewa kwenye akaunti.",
  "auth.forgot.newPassword": "Nenosiri jipya",
  "auth.forgot.confirmPassword": "Thibitisha nenosiri jipya",
  "auth.forgot.reset": "Weka Nenosiri Jipya",
  "auth.forgot.resetting": "Inabadilisha…",
  "auth.forgot.success":
    "Nenosiri lako limebadilishwa. Ingia kwa nenosiri jipya.",
  "auth.forgot.mismatch": "Manenosiri mawili hayafanani.",
  "auth.forgot.tooShort": "Nenosiri lazima liwe na angalau herufi 10.",
  "auth.forgot.changeEmail": "Tumia barua pepe nyingine",
  "auth.forgot.backToLogin": "Rudi kuingia",
  "auth.forgot.devCode": "Kodi ya hali ya majaribio: {code}",
  "auth.forgot.verifiedNote": "Kodi imethibitishwa. Chagua nenosiri lako jipya sasa.",
  "auth.forgot.invalidCode": "Kodi hiyo haikukubaliwa. Iangalie na ujaribu tena.",

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
  // ── Auth refresh · steps, fields, trust ──────────────────────────────────
  "auth.stepper.position": "Hatua {current} kati ya {total}",
  "auth.password.rule.length": "Herufi 10+",
  "auth.password.rule.mix": "Herufi na namba",
  "auth.password.rule.case": "Herufi kubwa na ndogo",
  "auth.password.rule.symbol": "Alama maalum",
  "auth.password.level.weak": "Dhaifu",
  "auth.password.level.fair": "Wastani",
  "auth.password.level.good": "Nzuri",
  "auth.password.level.strong": "Imara",
  "auth.otp.requiredBadge": "Lazima",
  "auth.register.type.resellerTitle": "Biashara ya WiFi",
  "auth.register.type.resellerBody": "Uza internet kwa wateja wako mwenyewe.",
  "auth.register.type.agentTitle": "Wakala wa mauzo",
  "auth.register.type.agentBody": "Leta biashara na upate kamisheni.",
  "auth.register.step1.title": "Akaunti yako",
  "auth.register.step1.body":
    "Tumia barua pepe unayoingia kila siku — kuingia na tahadhari za usalama zinatumwa hapo.",
  "auth.register.step2.title": "Biashara yako",
  "auth.register.step2.body": "Hivi ndivyo wateja wanaona wanaponunua WiFi kwako.",
  "auth.register.step3.title": "Thibitisha maelezo",
  "auth.register.step3.body": "Kagua maelezo, kisha thibitisha kuwa barua pepe ni yako.",
  "auth.register.emailHint": "Kodi yako ya uthibitisho inatumwa kwenye anwani hii.",
  "auth.register.phoneHint": "Namba ya Tanzania. 0712… huhifadhiwa kama +255712…",
  "auth.register.slugPreview": "Ukurasa wako wa WiFi",
  "auth.register.slugNote": "Namba fupi huongezwa mwisho ili anwani isitumiwe na mwingine.",
  "auth.register.referralValid": "Muundo wa kodi unaonekana sawa",
  "auth.register.error.referral":
    "Kodi ya rufaa ina herufi 4–24: herufi, namba, - au _.",
  "auth.register.summary.title": "Kagua maelezo yako",
  "auth.register.summary.edit": "Badilisha",
  "auth.register.nextSteps.title": "Kinachofuata",
  "auth.register.nextSteps.plan": "Chagua mpango",
  "auth.register.nextSteps.site": "Tengeneza eneo",
  "auth.register.nextSteps.device": "Unganisha router",
  "auth.register.agent.benefit.commission.title": "Kamisheni ya kila mwezi",
  "auth.register.agent.benefit.dashboard.title": "Dashibodi ya moja kwa moja",
  "auth.register.agent.benefit.code.title": "Kodi yako mwenyewe",
  "auth.register.trust.free": "Hakuna ada ya usajili",
  "auth.register.trust.minutes": "Hai hewani ndani ya dakika 5",
  "auth.register.trust.secure": "Usimbaji fiche wa kiwango cha benki",
  "auth.login.socialPrompt": "Ingia haraka na:",
  "auth.login.useAnother": "Tumia akaunti nyingine",
  "auth.register.timeHint": "Inachukua dakika 2 hivi",
  "auth.login.trust.secure": "Kikao kilichosimbwa",
  "auth.login.trust.mfa": "Inasaidia uthibitisho wa hatua mbili",

  // ── Google sign-in ───────────────────────────────────────────────────────
  "auth.social.continueWithGoogle": "Endelea na Google",
  "auth.social.connectingGoogle": "Inafungua Google…",
  "auth.social.recommended": "Haraka zaidi",
  "auth.social.soon": "Hivi karibuni",
  "auth.google.badge": "Imethibitishwa na Google",
  "auth.google.title": "Hatua moja ya mwisho",
  "auth.google.body":
    "Google tayari imethibitisha barua pepe yako. Tuambie utatumia Advo vipi ili tufungue akaunti sahihi.",
  "auth.google.accountType": "Aina ya akaunti",
  "auth.google.phoneHint": "Wateja na huduma ya msaada wanakufikia kwa namba hii.",
  "auth.google.submit": "Fungua akaunti yangu",
  "auth.google.submitPending": "Inafungua akaunti yako…",
  "auth.google.switchAccount": "Badilisha",
  "auth.google.notYou": "Si akaunti yako?",
  "auth.google.useAnother": "Tumia akaunti nyingine ya Google",
  "auth.google.missing.title": "Usajili huu wa Google umeisha muda",
  "auth.google.missing.body":
    "Kwa usalama wako kiungo hiki hufanya kazi kwa dakika chache tu. Anza tena na Google itakurudisha hapa moja kwa moja.",
  "auth.google.missing.action": "Anza tena",
  "auth.google.error.cancelled": "Kuingia na Google kumeghairiwa. Hakuna kilichobadilika.",
  "auth.google.error.expired": "Kuingia na Google kumechukua muda mrefu. Tafadhali jaribu tena.",
  "auth.google.error.unavailable":
    "Kuingia na Google bado hakujawashwa. Kwa sasa tumia barua pepe na nenosiri.",
  "auth.google.error.failed": "Google haikuweza kukamilisha kuingia. Tafadhali jaribu tena.",
  "auth.google.error.notAllowed":
    "Akaunti hii haiwezi kuingia na Google. Tumia nenosiri lako badala yake.",
  "auth.google.error.notVerified":
    "Google haijathibitisha barua pepe hii. Tumia barua pepe na nenosiri badala yake.",

};

export const authCatalog = { en: authEn, sw: authSw };
