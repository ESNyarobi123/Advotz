/**
 * Public marketing site: home, pricing, features, contact, FAQ, header, footer
 * and the interactive calculator.
 *
 * English is the source of truth: `sw` is typed against `marketingEn`, so a key
 * added here without a Swahili entry fails the build.
 *
 * Prefixes: `marketing.home.*`, `marketing.pricing.*`, `marketing.features.*`,
 * `marketing.contact.*`, `marketing.faq.*`, `marketing.footer.*`,
 * `marketing.calculator.*`.
 */
export const marketingEn = {
  // ── Home · hero ──────────────────────────────────────────────────────────
  "marketing.home.hero.badge": "Tanzania Smart WiFi Billing & Omada SDN Management",
  "marketing.home.hero.titleLead": "Turn Your WiFi Into",
  "marketing.home.hero.titleAccent": "a Money Machine",
  "marketing.home.hero.titleTrail": "Every Single Day.",
  "marketing.home.hero.subLead": "Connect your",
  "marketing.home.hero.subOmada": "TP-Link Omada",
  "marketing.home.hero.subMid": "to instant payments from",
  "marketing.home.hero.subMomo": "M-Pesa, Tigo Pesa, Airtel Money, Halopesa",
  "marketing.home.hero.subTrail":
    "or paper vouchers. No theft—every second and every shilling is verified by a double-entry financial ledger.",
  "marketing.home.hero.ctaRegister": "Register Your Business Now",
  "marketing.home.hero.ctaSecondary": "See How It Works",
  "marketing.home.trust.setup": "Free 2-minute setup",
  "marketing.home.trust.noCard": "No bank card required",
  "marketing.home.trust.mobilePay": "Payments straight to your phone",

  // ── Home · hero device mockup (the guest captive portal on a phone) ───────
  // Plays the approved portal flow end to end: sponsored banner → choose a pass
  // by mobile money → connected session with Explore below it.
  "marketing.home.hero.portal.live": "Live captive portal",
  "marketing.home.hero.portal.ssid": "SSID: PalmBeach_Guest",
  "marketing.home.hero.portal.name": "Palm Beach WiFi",
  "marketing.home.hero.portal.location": "Kariakoo, Dar es Salaam",
  "marketing.home.hero.portal.status.ready": "Ready to connect",
  "marketing.home.hero.portal.status.online": "You're online",
  "marketing.home.hero.portal.help": "Need help?",
  "marketing.home.hero.portal.step.pick": "Pick a package",
  "marketing.home.hero.portal.step.pay": "Pay by phone",
  "marketing.home.hero.portal.step.online": "Connected",
  "marketing.home.hero.portal.journey.choose": "Choose",
  "marketing.home.hero.portal.journey.pay": "Pay",
  "marketing.home.hero.portal.journey.connect": "Connect",
  "marketing.home.hero.portal.banner.business": "Ubungo Fresh Café",
  "marketing.home.hero.portal.banner.title": "A small break. A very good coffee.",
  "marketing.home.hero.portal.banner.body": "Fresh brews, warm bites and a little time for yourself.",
  "marketing.home.hero.portal.banner.cta": "Take a little break",
  "marketing.home.hero.portal.banner.credit": "Partner spotlight · AdvoWiFi",
  "marketing.home.hero.portal.welcome.eyebrow": "Your neighbourhood. Your connection.",
  "marketing.home.hero.portal.welcome.title": "Welcome to {name}.",
  "marketing.home.hero.portal.welcome.body":
    "A little work, a little play. Pick your pass and make yourself at home online.",
  "marketing.home.hero.portal.packages.title": "Choose your pass.",
  "marketing.home.hero.portal.packages.subtitle": "Your time starts when you connect.",
  "marketing.home.hero.portal.filter.daily": "Daily passes",
  "marketing.home.hero.portal.filter.long": "Longer stays",
  "marketing.home.hero.portal.select": "Choose this pass",
  "marketing.home.hero.portal.popular": "Most popular",
  "marketing.home.hero.portal.bestValue": "More speed",
  "marketing.home.hero.portal.voucher": "Already have a voucher?",
  "marketing.home.hero.portal.voucherCode": "Enter code",
  "marketing.home.hero.portal.payWith": "Pay with",
  "marketing.home.hero.portal.service.instant": "Connect after payment",
  "marketing.home.hero.portal.service.noAccount": "No account needed",
  "marketing.home.hero.portal.service.support": "Local support, always nearby",
  "marketing.home.hero.portal.pkg1.name": "Quick Access",
  "marketing.home.hero.portal.pkg1.duration": "1 hour",
  "marketing.home.hero.portal.pkg2.name": "Flexible",
  "marketing.home.hero.portal.pkg2.duration": "3 hours",
  "marketing.home.hero.portal.pkg3.name": "Day Pass",
  "marketing.home.hero.portal.pkg3.duration": "24 hours",
  "marketing.home.hero.portal.pkg4.name": "Monthly",
  "marketing.home.hero.portal.pkg4.duration": "30 days",
  "marketing.home.hero.portal.pick": "Choose Your Package",
  "marketing.home.hero.portal.pay": "Pay TZS {amount}",
  "marketing.home.hero.portal.checkout.title": "Your pass to good WiFi.",
  "marketing.home.hero.portal.checkout.subtitle": "Pay with mobile money. Get connected in a moment.",
  "marketing.home.hero.portal.checkout.phone": "Mobile money number",
  "marketing.home.hero.portal.checkout.phoneHelp": "Enter 07… / 06… or a number starting with +255.",
  "marketing.home.hero.portal.checkout.total": "Total to pay",
  "marketing.home.hero.portal.checkout.providedBy": "Provided by {name}",
  "marketing.home.hero.portal.checkout.terms": "By continuing, you agree to the WiFi terms.",
  "marketing.home.hero.portal.waiting.title": "Check your phone.",
  "marketing.home.hero.portal.waiting.body":
    "Approve the mobile money request on your phone. Never enter your mobile money PIN here.",
  "marketing.home.hero.portal.connecting.title": "Making room for you.",
  "marketing.home.hero.portal.connecting.body": "Payment approved. Connecting you to {name}…",
  "marketing.home.hero.portal.pushTitle": "M-Pesa",
  "marketing.home.hero.portal.pushBody": "Enter PIN to pay TZS {amount} to ADVO TZ WiFi",
  "marketing.home.hero.portal.requesting": "Sending the M-Pesa request…",
  "marketing.home.hero.portal.authorizing": "Omada is authorizing this device…",
  "marketing.home.hero.portal.confirmPin": "Confirm the PIN prompt on your phone.",
  "marketing.home.hero.portal.connected.eyebrow": "Payment complete · WiFi active",
  "marketing.home.hero.portal.connected": "You're connected.",
  "marketing.home.hero.portal.connectedBody": "Good things are a connection away.",
  "marketing.home.hero.portal.browse": "Start browsing",
  "marketing.home.hero.portal.receiptButton": "View receipt",
  "marketing.home.hero.portal.ticket.activePass": "Your active pass",
  "marketing.home.hero.portal.ticket.connected": "Connected",
  "marketing.home.hero.portal.ticket.ended": "Ended",
  "marketing.home.hero.portal.ticket.device": "device",
  "marketing.home.hero.portal.ticket.voucherPass": "Your voucher",
  "marketing.home.hero.portal.ticket.validity": "Validity",
  "marketing.home.hero.portal.ticket.upTo": "Up to",
  "marketing.home.hero.portal.ticket.data": "Data",
  "marketing.home.hero.portal.ticket.access": "Access",
  "marketing.home.hero.portal.ticket.validUntil": "Valid until",
  "marketing.home.hero.portal.ticket.paid": "{amount} paid",
  "marketing.home.hero.portal.remaining": "Time Remaining",
  "marketing.home.hero.portal.recovery": "Recovery token sent by SMS",
  "marketing.home.hero.portal.secure": "Secured by Advo TZ · No extra charges",
  "marketing.home.hero.portal.explore.eyebrow": "A little discovery, on us.",
  "marketing.home.hero.portal.explore.title": "Explore around you.",
  "marketing.home.hero.portal.explore.body": "Local favourites and offers worth a look.",
  "marketing.home.hero.portal.explore.offer": "View offer",
  "marketing.home.hero.portal.explore.note": "Sponsored discoveries, curated by AdvoWiFi.",
  "marketing.home.hero.portal.biz1.name": "Sinza Tech Point",
  "marketing.home.hero.portal.biz1.category": "Tech & gadgets",
  "marketing.home.hero.portal.biz1.body": "Headphones, phones and accessories in Sinza.",
  "marketing.home.hero.portal.biz1.location": "Sinza",
  "marketing.home.hero.portal.biz2.name": "Kimara Style Studio",
  "marketing.home.hero.portal.biz2.category": "Beauty & fashion",
  "marketing.home.hero.portal.biz2.body": "A fresh look, a favourite find, right here.",
  "marketing.home.hero.portal.biz2.location": "Kimara",
  "marketing.home.hero.portal.shortcut.website": "Discover Advotz",
  "marketing.home.hero.portal.shortcut.websiteSub": "A little more to explore",
  "marketing.home.hero.portal.shortcut.jobs": "Jobs & opportunities",
  "marketing.home.hero.portal.shortcut.jobsSub": "Your next chapter starts here",
  "marketing.home.hero.portal.shortcut.promote": "Promote your business",
  "marketing.home.hero.portal.shortcut.promoteSub": "Be discovered in your neighbourhood",
  "marketing.home.hero.portal.poweredBy": "Powered by",
  "marketing.home.hero.portal.receipt": "Payment received",
  "marketing.home.hero.portal.receiptDevice": "Kariakoo Hub · Omada OC200",
  "marketing.home.hero.social.label": "WiFi operators already earning",
  "marketing.home.hero.social.rating": "4.9/5",
  "marketing.home.hero.social.reviews": "from 120+ operators across Tanzania",

  // ── Home · impact stats ──────────────────────────────────────────────────
  "marketing.home.stats.speedValue": "3 Seconds",
  "marketing.home.stats.speedLabel": "M-Pesa to connected",
  "marketing.home.stats.uptimeLabel": "Network reliability (uptime)",
  "marketing.home.stats.ledgerLabel": "Double-entry ledger security",
  "marketing.home.stats.lossLabel": "Revenue or voucher leakage",

  // ── Home · solutions ─────────────────────────────────────────────────────
  "marketing.home.solutions.badge": "Purpose-Built Solutions",
  "marketing.home.solutions.title": "Purpose-Built For Every Kind Of Business In Tanzania",
  "marketing.home.solutions.subtitle":
    "Whether you run a restaurant in Kariakoo, a tourist hotel in Zanzibar or a student hostel in Dodoma, Advo TZ gives you full power to manage and sell internet.",
  "marketing.home.solutions.cafe.title": "Cafés, Bars & Lounges",
  "marketing.home.solutions.cafe.desc":
    "Sell quick 1-hour or 3-hour packages to guests having coffee or a meal. Customers pay by M-Pesa without pestering your waiting staff.",
  "marketing.home.solutions.cafe.feature1": "Self-service captive portal",
  "marketing.home.solutions.cafe.feature2": "Less pressure on waiting staff",
  "marketing.home.solutions.hotel.title": "Hotels, Lodges & Resorts",
  "marketing.home.solutions.hotel.desc":
    "Give your guests free vouchers or multi-day packages. Add your hotel's logo and photos to the login page (custom branding).",
  "marketing.home.solutions.hotel.feature1": "Printed paper vouchers",
  "marketing.home.solutions.hotel.feature2": "Your hotel logo and photos",
  "marketing.home.solutions.hostel.title": "Hostels & Student Housing",
  "marketing.home.solutions.hostel.desc":
    "Students pay for weekly or monthly packages. Cap the number of devices to stop one student from sharing internet with a whole block.",
  "marketing.home.solutions.hostel.feature1": "2 or 3 device limit",
  "marketing.home.solutions.hostel.feature2": "Monthly and term packages",
  "marketing.home.solutions.wisp.title": "WISPs & Network Installers",
  "marketing.home.solutions.wisp.desc":
    "Manage 10 or 50 sites from one account. Connect a TP-Link Omada hardware or software controller and get reports for every site.",
  "marketing.home.solutions.wisp.feature1": "Multi-site management",
  "marketing.home.solutions.wisp.feature2": "Commissions for agents",

  // ── Home · how it works ──────────────────────────────────────────────────
  "marketing.home.how.badge": "Simple Guide",
  "marketing.home.how.title": "Start Selling WiFi In Just Four Steps",
  "marketing.home.how.subtitle":
    "You don't need to be a seasoned network engineer. Our system is built to run automatically from the first day.",
  "marketing.home.how.step1.title": "Create A Free Account",
  "marketing.home.how.step1.desc":
    "Enter your business name, phone number and email. Your account opens instantly with no upfront payment.",
  "marketing.home.how.step2.title": "Connect Omada",
  "marketing.home.how.step2.desc":
    "Add your controller details (OC200, OC300 or PC). The system talks to your devices with full security.",
  "marketing.home.how.step3.title": "Set Up Your Packages",
  "marketing.home.how.step3.desc":
    "Set prices in Tanzanian shillings (TZS). Create 1-hour, 3-hour, 1-day or monthly packages to suit your customers.",
  "marketing.home.how.step4.title": "Collect Revenue Automatically",
  "marketing.home.how.step4.desc":
    "Customers pay by M-Pesa and are connected instantly. Withdraw your money to your phone any time!",
  "marketing.home.how.cta": "Open Your Trial Account Now",

  // ── Home · features deep dive ────────────────────────────────────────────
  "marketing.home.features.badge": "Platform Power",
  "marketing.home.features.title":
    "High-End Technology That Guards Every Shilling Of Your Business",
  "marketing.home.features.subtitle":
    "We've hardened every part of security, accounting and network control so you can run your business with peace of mind from anywhere in the world.",
  "marketing.home.features.ledger.title": "Append-Only Double-Entry Ledger",
  "marketing.home.features.ledger.desc":
    "Unlike other systems that delete records, Advo TZ uses a bank-grade double-entry ledger. No balance can be increased or reduced without a complete transaction that leaves an unerasable receipt.",
  "marketing.home.features.omada.title": "TP-Link Omada SDN Native Integration",
  "marketing.home.features.omada.desc":
    "No fragile Mikrotik scripts that stall under load. Advo TZ works directly with the Omada Open API, authorizing and cutting off devices at exactly the right second.",
  "marketing.home.features.device.title": "Smart Device Limit & Battery Recovery",
  "marketing.home.features.device.desc":
    "If a customer's phone dies or they switch devices, they don't lose their money. Our system issues a recovery token so they can connect a new device within the device limit they paid for.",
  "marketing.home.features.vouchers.title": "Printable Vouchers & QR Codes",
  "marketing.home.features.vouchers.desc":
    "Generate a batch of 50 or 1,000 vouchers in a single second. They carry short numeric codes and a QR code for customers who want to scan with a camera. Export to CSV or print them directly.",
  "marketing.home.features.agents.title": "Agent Network (Recurring Commissions)",
  "marketing.home.features.agents.desc":
    "Incentivise the technicians and resellers who bring in new WiFi owners. Agents earn up to 15% of the monthly fee automatically through our referral attribution system.",
  "marketing.home.features.reports.title": "Real-Time Reports & Withdrawals",
  "marketing.home.features.reports.desc":
    "See every device that's online, the bandwidth in use and the total money collected. Withdraw your funds instantly to M-Pesa / Tigo Pesa whenever you want.",

  // ── Home · pricing preview ───────────────────────────────────────────────
  "marketing.home.pricing.badge": "Affordable Pricing",
  "marketing.home.pricing.title": "Packages To Get Your Business Started",
  "marketing.home.pricing.subtitle":
    "Pick the package that fits the size of your business. There are no mandatory long-term contracts—you can switch at any time.",

  // ── Home · testimonials ──────────────────────────────────────────────────
  "marketing.home.testimonials.badge": "Customer Stories",
  "marketing.home.testimonials.title": "What Tanzanian Business Owners Say",
  "marketing.home.testimonials.subtitle":
    "See how your peers earn every day through Advo TZ.",
  "marketing.home.testimonials.1.quote":
    "We were losing more than three hundred thousand shillings a month because paper vouchers went missing and waiters handed out the password for free. Since we put Advo TZ in our Kariakoo restaurant, customers pay by M-Pesa themselves and every shilling shows up on my phone.",
  "marketing.home.testimonials.1.role": "Owner, City Bistro · Kariakoo, DSM",
  "marketing.home.testimonials.2.quote":
    "At our Zanzibar lodge, many guests want fast internet that just connects without a hundred questions. Omada + Advo TZ has been a lifesaver. A guest picks 24 hours, gets a prompt on their phone and is connected instantly without coming to reception.",
  "marketing.home.testimonials.2.role": "Operations Manager · Nungwi, Zanzibar",
  "marketing.home.testimonials.3.quote":
    "I'm a network installer. I've connected more than 12 customers to Advo TZ as an agent. Every month I get my commission straight into my wallet with no delay. It's a great source of extra income.",
  "marketing.home.testimonials.3.role": "IT Specialist & Advo Agent · Arusha",

  // ── Home · closing CTA ───────────────────────────────────────────────────
  "marketing.home.cta.badge": "Never Lose Revenue Again",
  "marketing.home.cta.title":
    "Start Receiving WiFi Payments Straight To Your Phone Today",
  "marketing.home.cta.body":
    "It takes just two minutes to set up your account. Connect your TP-Link Omada now and see it work free of charge, with no upfront payment.",
  "marketing.home.cta.register": "Open Your Free Account",
  "marketing.home.cta.contact": "Talk To Our Team",

  // ── Pricing page ─────────────────────────────────────────────────────────
  "marketing.pricing.badge": "Simple Pricing & Full Transparency",
  "marketing.pricing.title": "Packages That Grow With Your Business",
  "marketing.pricing.subtitle":
    "All prices are in Tanzanian shillings (TZS). No hidden fees or unclear deductions. Pay monthly by M-Pesa or Tigo Pesa.",
  "marketing.pricing.popular": "Most Popular",
  "marketing.pricing.guarantee.title":
    "Try The System Free For {days} Days With No Upfront Payment",
  "marketing.pricing.guarantee.body":
    "Open an account, start the {days}-day free trial on {plan}, connect your TP-Link Omada and test WiFi sales in your real environment. If it doesn't meet your expectations, you're under no obligation to continue.",
  "marketing.pricing.guarantee.cta": "Start The Trial",
  "marketing.pricing.guarantee.ctaNoTrial": "Open An Account",
  "marketing.pricing.guarantee.noTrial.title": "No Joining Fee And No Contracts",
  "marketing.pricing.guarantee.noTrial.body":
    "Open an account, connect your TP-Link Omada and test WiFi sales in your real environment. You are under no obligation to continue.",

  // ── Live plan catalog (fetched from Admin) ───────────────────────────────
  // Facts come from the API; only the wording lives here, so a new language
  // needs no API change.
  "marketing.plans.sites": "Sites",
  "marketing.plans.devices": "Access points",
  "marketing.plans.packages": "Packages / site",
  "marketing.plans.unlimited": "Unlimited",
  "marketing.plans.capacity": "Capacity",
  "marketing.plans.included": "What's included",
  "marketing.plans.trial": "{days}-day free trial",
  "marketing.plans.noTrial": "No free trial",
  "marketing.plans.perPeriod": "per {days} days",
  "marketing.plans.perMonth": "per month",
  "marketing.plans.demo": "Demo price",
  "marketing.plans.adFree": "Ad Free promise",
  "marketing.plans.ads.none": "No advertising at all",
  "marketing.plans.ads.optional": "You choose when ads show",
  "marketing.plans.ads.required": "Sponsored ads required",
  "marketing.plans.colors": "Your own brand colours & logo",
  "marketing.plans.badgeRemovable": "Remove the Advo badge",
  "marketing.plans.voucher": "Voucher redemption",
  "marketing.plans.orderEdit": "Reorder WiFi packages",
  "marketing.plans.cardStyles": "{count} package card styles",
  "marketing.plans.unlimitedSites": "Unlimited sites & devices",
  "marketing.plans.choose": "Choose this plan",
  "marketing.plans.contact": "Talk to our team",
  "marketing.plans.empty": "New pricing is being finalised. Talk to our team for a quote.",

  // ── Features page ────────────────────────────────────────────────────────
  "marketing.features.badge": "In-Depth Features",
  "marketing.features.title": "Everything You Need To Run Your WiFi Network",
  "marketing.features.subtitle":
    "Advo TZ combines TP-Link Omada networking with Tanzania's mobile money systems (M-Pesa, Tigo Pesa, Airtel Money, Halopesa) to deliver an exceptional experience for customers and owners alike.",
  "marketing.features.portal.title": "Modern Mobile Captive Portal",
  "marketing.features.portal.desc":
    "Guests joining your WiFi get a modern page that opens instantly. It shows time packages, real prices in TZS, and lets them pay by M-Pesa or voucher card without asking for a password.",
  "marketing.features.portal.feature1": "Instant USSD push notification",
  "marketing.features.portal.feature2": "Your business logo and photos",
  "marketing.features.portal.feature3": "Swahili and English languages",
  "marketing.features.omada.title": "TP-Link Omada SDN Integration",
  "marketing.features.omada.desc":
    "The system connects directly to all Omada controllers: hardware controllers (OC200, OC300) or software controllers. It talks to the controller to authorize paying customers' MAC addresses and cut them off once time runs out.",
  "marketing.features.omada.feature1": "No failing Mikrotik scripts",
  "marketing.features.omada.feature2": "Speed control (bandwidth limit per user)",
  "marketing.features.omada.feature3": "Status monitoring for every access point",
  "marketing.features.vouchers.title": "Paper Vouchers With Barcode & QR",
  "marketing.features.vouchers.desc":
    "Generate 100 or 1,000 vouchers in a second. Each voucher has an easy-to-read short code or a QR code a customer's phone can scan. You can sell them for cash at the counter or in a shop.",
  "marketing.features.vouchers.feature1": "Print cards with your own logo",
  "marketing.features.vouchers.feature2": "CSV export for point-of-sale (POS) software",
  "marketing.features.vouchers.feature3": "Void vouchers that haven't been used",
  "marketing.features.ledger.title": "Double-Entry Financial Ledger",
  "marketing.features.ledger.desc":
    "Every mobile payment is split in accounting terms (gross sale, network provider fee, platform fee and the owner's net payable). The database refuses to delete or change any record, keeping the ledger permanently balanced.",
  "marketing.features.ledger.feature1": "Bank-grade security",
  "marketing.features.ledger.feature2": "Detailed audit logs",
  "marketing.features.ledger.feature3": "Secure withdrawals",
  "marketing.features.devices.title": "Device Limits & Roaming",
  "marketing.features.devices.desc":
    "Stop customers from sharing one voucher with a whole street. Each package can carry its own limit (for example 1 device for a regular customer, or 2 devices for a VIP). Guests move from one access point to another without dropping off.",
  "marketing.features.devices.feature1": "Seamless roaming across the whole building",
  "marketing.features.devices.feature2": "Battery recovery token if a customer's phone dies",
  "marketing.features.devices.feature3": "Protect bandwidth from being abused",
  "marketing.features.agents.title": "Agent Network",
  "marketing.features.agents.desc":
    "Grow your business by bringing in network technicians or sales agents. Agents get their own referral codes and dashboard, earning monthly commissions automatically when their customers pay their fees.",
  "marketing.features.agents.feature1": "Recurring monthly commission",
  "marketing.features.agents.feature2": "Commission payouts to M-Pesa",
  "marketing.features.agents.feature3": "Track the customers your agents bring in",
  "marketing.features.cta.title": "Ready To Start Using These Features?",
  "marketing.features.cta.body":
    "Join hundreds of businesses using Advo TZ to run their network efficiently and securely.",
  "marketing.features.cta.register": "Open A Free Account",
  "marketing.features.cta.pricing": "See Package Pricing",

  // ── Contact page ─────────────────────────────────────────────────────────
  "marketing.contact.badge": "Support & Advice",
  "marketing.contact.title": "Talk To The Advo TZ Team",
  "marketing.contact.subtitle":
    "Questions about setting up your TP-Link Omada devices or choosing the right package? We're here to help you get started.",
  "marketing.contact.details.title": "Contact Information",
  "marketing.contact.details.office": "Head Office",
  "marketing.contact.details.phone": "Phone & WhatsApp",
  "marketing.contact.details.hours": "Available around the clock",
  "marketing.contact.details.email": "Email",
  "marketing.contact.details.emailResponse": "Replies within 2 hours",
  "marketing.contact.details.installTitle": "Omada Installation Where You Are:",
  "marketing.contact.details.installBody":
    "If you need certified technicians to install TP-Link Omada at your location, let us know and we'll connect you with a nearby agent.",
  "marketing.contact.success.title": "Thank You! We've Received Your Message.",
  "marketing.contact.success.body":
    "Our WiFi network specialist will contact you on your phone number shortly.",
  "marketing.contact.success.again": "Send Another Message",
  "marketing.contact.form.title": "Send A Message Or Request Free Advice",
  "marketing.contact.form.name": "Your Full Name",
  "marketing.contact.form.namePlaceholder": "e.g. Daudi John",
  "marketing.contact.form.business": "Business / Hotel Name",
  "marketing.contact.form.businessPlaceholder": "e.g. Sunset Lounge",
  "marketing.contact.form.phone": "Phone Number (WhatsApp)",
  "marketing.contact.form.phonePlaceholder": "07XX XXX XXX",
  "marketing.contact.form.venueType": "Business Type",
  "marketing.contact.form.venue.cafe": "Café Or Bar",
  "marketing.contact.form.venue.hotel": "Hotel Or Lodge",
  "marketing.contact.form.venue.hostel": "Hostel Or Student Housing",
  "marketing.contact.form.venue.wisp": "WISP / Internet Provider",
  "marketing.contact.form.venue.agent": "I Want To Be An Agent",
  "marketing.contact.form.message": "Your Message Or Questions",
  "marketing.contact.form.messagePlaceholder":
    "Tell us how many access points you have, or any question you have…",
  "marketing.contact.form.submit": "Send Message Now",

  // ── FAQ ──────────────────────────────────────────────────────────────────
  "marketing.faq.badge": "Frequently Asked Questions",
  "marketing.faq.title": "Everything You Need To Know About Advo TZ",
  "marketing.faq.subtitle":
    "Have another question? Our expert team is ready to help you 24 hours a day.",
  "marketing.faq.q1": "What TP-Link Omada hardware do I need to start?",
  "marketing.faq.a1":
    "You need a TP-Link Omada controller (either hardware such as the OC200 or OC300, or a software controller running on a computer/VPS) plus any TP-Link Omada EAP access point (such as the EAP110, EAP225, EAP610, etc.). Advo TZ connects directly to your controller through the Open API and Hotspot Operator.",
  "marketing.faq.q2": "How does the money from WiFi sales get to my phone?",
  "marketing.faq.a2":
    "When customers buy packages with M-Pesa, Tigo Pesa, Airtel Money or Halopesa, the money lands in your Advo TZ wallet immediately, recorded in the double-entry ledger. You can withdraw your money straight to your mobile number at any time.",
  "marketing.faq.q3": "What about customers who prefer to pay cash?",
  "marketing.faq.a3":
    "Advo TZ lets you generate and print paper vouchers with short codes or a QR code in one click. Your attendant can sell these vouchers to guests for cash, and the customer enters them on the portal without needing a phone number.",
  "marketing.faq.q4":
    "What happens if a customer's phone dies or they switch devices?",
  "marketing.faq.a4":
    "The system has a special 'Recovery Token' feature. The customer gets a link on their receipt that lets them connect a new device or another phone within their package's device limit without paying a second time.",
  "marketing.faq.q5": "Can I appoint agents to help me grow the network?",
  "marketing.faq.a5":
    "Absolutely! Advo TZ has a complete agent network. You can register agents who get their own referral codes and invitation links, earning a monthly commission automatically while their customers keep using the system.",
  "marketing.faq.q6": "How does the system prevent theft and revenue leaks?",
  "marketing.faq.a6":
    "Unlike legacy systems built on fragile Mikrotik scripts, Advo TZ uses international-standard accounting (an append-only double-entry ledger). No one can change or delete a transaction record. Every shilling and every second a customer uses has a full code and receipt trail.",

  // ── Interactive revenue calculator ───────────────────────────────────────
  "marketing.calculator.venue.cafe": "Cafés & Bars",
  "marketing.calculator.venue.hotel": "Hotels & Lodges",
  "marketing.calculator.venue.hostel": "Hostels & Students",
  "marketing.calculator.venue.wisp": "WISP & Neighbourhood",
  "marketing.calculator.badge": "Revenue Calculator",
  "marketing.calculator.title":
    "How Many Shillings Will You Make A Month From Your WiFi?",
  "marketing.calculator.subtitle":
    "Use the sliders below to estimate your revenue based on the number of customers and your package prices.",
  "marketing.calculator.dailyUsers.label": "Paying Customers Per Day:",
  "marketing.calculator.guestsValue": "{count} Customers",
  "marketing.calculator.guestsTick": "{count} customers",
  "marketing.calculator.avgPrice.label": "Average Package Price:",
  "marketing.calculator.note":
    "All figures assume a 30-day month and standard mobile network fees.",
  "marketing.calculator.result.dailyGross": "Total Sales Per Day:",
  "marketing.calculator.result.monthlyGross": "Monthly Sales (Gross):",
  "marketing.calculator.result.fees": "Mobile Money & Platform Fees:",
  "marketing.calculator.result.netProfit": "Your Real Profit In Hand (Net Profit):",
  "marketing.calculator.result.yearly":
    "In just one month, you could earn more than TZS {amount} a year!",
  "marketing.calculator.cta": "Start Earning This Revenue Today",

  // ── Marketing footer ─────────────────────────────────────────────────────
  "marketing.footer.introLead":
    "Tanzania's number-one system for managing and selling WiFi internet, in partnership with",
  "marketing.footer.introOmada": "TP-Link Omada SDN",
  "marketing.footer.introTrail":
    "Customers pay with M-Pesa, Tigo Pesa, Airtel Money and Halopesa or paper vouchers, and get connected instantly.",
  "marketing.footer.pill.ledger": "Double-Entry Ledger",
  "marketing.footer.pill.omada": "TP-Link Omada Ready",
  "marketing.footer.pill.noTheft": "100% No Voucher Theft",
  "marketing.footer.products.title": "Products",
  "marketing.footer.products.portal": "Mobile Captive Portal",
  "marketing.footer.products.omada": "Omada SDN Integration",
  "marketing.footer.products.vouchers": "Voucher Printing",
  "marketing.footer.products.ledger": "Money Wallet & Ledger",
  "marketing.footer.products.agents": "Agent Network (Agents)",
  "marketing.footer.customers.title": "Our Customers",
  "marketing.footer.customers.hotels": "Hotels, Lodges & Resorts",
  "marketing.footer.customers.cafes": "Cafés, Bars & Lounges",
  "marketing.footer.customers.hostels": "Hostels & Students",
  "marketing.footer.customers.wisp": "ISP & WISP Resellers",
  "marketing.footer.customers.calculator": "Revenue Calculator",
  "marketing.footer.contact.title": "Contact",
  "marketing.footer.status": "All Systems Operational (99.98%)",
  "marketing.footer.rights": "All rights reserved.",
  "marketing.footer.bottom.pricing": "Packages & Pricing",
  "marketing.footer.bottom.login": "Log In To Your Account",
  "marketing.footer.bottom.hotspots": "Our Hotspots",
  "marketing.footer.bottom.services": "Services",

  // ── Our Hotspots page ────────────────────────────────────────────────────
  "marketing.hotspots.badge": "Find Advo WiFi",
  "marketing.hotspots.title": "Our Hotspots",
  "marketing.hotspots.subtitle":
    "Places across Tanzania where Advo WiFi is live — explore the map or browse by city.",
  "marketing.hotspots.searchPlaceholder": "Search by name, city, or category…",
  "marketing.hotspots.allCities": "All cities",
  "marketing.hotspots.count": "{count} hotspots",
  "marketing.hotspots.countOne": "1 hotspot",
  "marketing.hotspots.empty": "No hotspots to show yet. Check back soon.",
  "marketing.hotspots.emptyFilter": "No hotspots match your search.",
  "marketing.hotspots.selectHint": "Select a location on the map or in the list.",
  "marketing.hotspots.visitPortal": "Open guest portal",
  "marketing.hotspots.mapLabel": "Hotspot map",
  "marketing.hotspots.listLabel": "Hotspot list",

  // ── Services (guest Explore menu) ────────────────────────────────────────
  "marketing.services.badge": "Guest WiFi Explore",
  "marketing.services.title": "Services",
  "marketing.services.subtitle":
    "Discover local businesses, events, offers and opportunities once you’re connected to AdvoWiFi.",
  "marketing.services.explore.eyebrow": "On the captive portal",
  "marketing.services.explore.title": "Explore menu",
  "marketing.services.explore.lead":
    "Explore what’s around you — from local businesses and events to useful opportunities and support.",
  "marketing.services.items.businesses.title": "Local Businesses & Offers",
  "marketing.services.items.businesses.body":
    "Discover nearby shops, cafés and services. Explore what they offer and find places worth visiting.",
  "marketing.services.items.advotz.title": "Visit Advotz.com",
  "marketing.services.items.advotz.body":
    "Visit Advotz to discover more businesses, services and opportunities.",
  "marketing.services.items.events.title": "Local Events",
  "marketing.services.items.events.body":
    "Find concerts, festivals, markets, sports and community events happening near you.",
  "marketing.services.items.holidays.title": "Holidays",
  "marketing.services.items.holidays.body":
    "Explore holiday ideas, weekend getaways, travel offers and exciting places to visit.",
  "marketing.services.items.jobs.title": "Jobs & Opportunities",
  "marketing.services.items.jobs.body":
    "Discover job vacancies, training programmes and other opportunities. View the details and learn how to apply.",
  "marketing.services.items.promote.title": "Promote your business",
  "marketing.services.items.promote.body":
    "Want more customers to discover your business? Enquire about advertising on AdvoWiFi and our team will get in touch.",
  "marketing.services.items.help.title": "Help",
  "marketing.services.items.help.body":
    "Need help connecting or using AdvoWiFi? Contact our support team for assistance.",
  "marketing.services.local.eyebrow": "Inside Local Businesses",
  "marketing.services.local.title": "Example local services",
  "marketing.services.local.lead":
    "Explore local services and everyday essentials near you.",
  "marketing.services.local.mpesa.name": "M-Pesa & Banking Agent",
  "marketing.services.local.mpesa.category": "Tech & Finance",
  "marketing.services.local.mpesa.body":
    "Find nearby mobile money and banking agents for deposits, withdrawals and other transactions.",
  "marketing.services.local.cafe.name": "Local Cafe & Fresh Bites",
  "marketing.services.local.cafe.category": "Food & Dining",
  "marketing.services.local.cafe.body":
    "Enjoy freshly brewed coffee, tea, pastries, refreshing juices and tasty meals.",
  "marketing.services.local.phones.name": "Mobile Tech & Accessories",
  "marketing.services.local.phones.category": "Tech & Phones",
  "marketing.services.local.phones.body":
    "Shop for phone chargers, cables, screen protectors, earphones, power banks and accessories.",
  "marketing.services.local.pharmacy.name": "Pharmacy & Wellness",
  "marketing.services.local.pharmacy.category": "Shops & Services",
  "marketing.services.local.pharmacy.body":
    "Find pharmacies offering medicines, first-aid essentials and everyday health products.",
} as const;

export type MarketingKey = keyof typeof marketingEn;

export const marketingSw: Record<MarketingKey, string> = {
  // ── Home · hero ──────────────────────────────────────────────────────────
  "marketing.home.hero.badge": "Malipo ya WiFi Mahiri Tanzania & Usimamizi wa Omada SDN",
  "marketing.home.hero.titleLead": "Badili WiFi Yako Kuwa",
  "marketing.home.hero.titleAccent": "Mashine Ya Mapato",
  "marketing.home.hero.titleTrail": "Ya Kila Siku.",
  "marketing.home.hero.subLead": "Unganisha",
  "marketing.home.hero.subOmada": "TP-Link Omada",
  "marketing.home.hero.subMid": "yako na malipo ya papo hapo ya",
  "marketing.home.hero.subMomo": "M-Pesa, Tigo Pesa, Airtel Money, Halopesa",
  "marketing.home.hero.subTrail":
    "au Vocha za karatasi. Hakuna wizi, kila sekunde na kila shilingi inathibitishwa na leja ya fedha ya kihasibu.",
  "marketing.home.hero.ctaRegister": "Sajili Biashara Yako Sasa",
  "marketing.home.hero.ctaSecondary": "Ona Inavyofanya Kazi",
  "marketing.home.trust.setup": "Usajili wa bure wa dakika 2",
  "marketing.home.trust.noCard": "Hakuna kadi ya benki inayohitajika",
  "marketing.home.trust.mobilePay": "Malipo moja kwa moja kwenye simu",

  // ── Home · hero device mockup (captive portal kwenye simu) ──────────────
  "marketing.home.hero.portal.live": "Captive portal ya papo hapo",
  "marketing.home.hero.portal.ssid": "SSID: PalmBeach_Guest",
  "marketing.home.hero.portal.name": "Palm Beach WiFi",
  "marketing.home.hero.portal.location": "Kariakoo, Dar es Salaam",
  "marketing.home.hero.portal.status.ready": "Tayari kuunganisha",
  "marketing.home.hero.portal.status.online": "Uko mtandaoni",
  "marketing.home.hero.portal.help": "Unahitaji msaada?",
  "marketing.home.hero.portal.step.pick": "Chagua kifurushi",
  "marketing.home.hero.portal.step.pay": "Lipia kwa simu",
  "marketing.home.hero.portal.step.online": "Umeunganishwa",
  "marketing.home.hero.portal.journey.choose": "Chagua",
  "marketing.home.hero.portal.journey.pay": "Lipia",
  "marketing.home.hero.portal.journey.connect": "Ungana",
  "marketing.home.hero.portal.banner.business": "Ubungo Fresh Café",
  "marketing.home.hero.portal.banner.title": "Pumzika kidogo. Kahawa nzuri kabisa.",
  "marketing.home.hero.portal.banner.body": "Kahawa mbichi, vitafunio vya moto na muda wako kidogo.",
  "marketing.home.hero.portal.banner.cta": "Pumzika kidogo",
  "marketing.home.hero.portal.banner.credit": "Washirika wetu · AdvoWiFi",
  "marketing.home.hero.portal.welcome.eyebrow": "Mtaa wako. Muunganisho wako.",
  "marketing.home.hero.portal.welcome.title": "Karibu {name}.",
  "marketing.home.hero.portal.welcome.body":
    "Kazi kidogo, starehe kidogo. Chagua kifurushi chako na ujisikie uko nyumbani mtandaoni.",
  "marketing.home.hero.portal.packages.title": "Chagua kifurushi chako.",
  "marketing.home.hero.portal.packages.subtitle": "Muda wako unaanza unapounganishwa.",
  "marketing.home.hero.portal.filter.daily": "Vifurushi vya siku",
  "marketing.home.hero.portal.filter.long": "Kukaa kwa muda mrefu",
  "marketing.home.hero.portal.select": "Chagua kifurushi hiki",
  "marketing.home.hero.portal.popular": "Maarufu zaidi",
  "marketing.home.hero.portal.bestValue": "Mwendo zaidi",
  "marketing.home.hero.portal.voucher": "Una voucher tayari?",
  "marketing.home.hero.portal.voucherCode": "Weka msimbo",
  "marketing.home.hero.portal.payWith": "Lipia kwa",
  "marketing.home.hero.portal.service.instant": "Ungana baada ya malipo",
  "marketing.home.hero.portal.service.noAccount": "Hakuna akaunti inayohitajika",
  "marketing.home.hero.portal.service.support": "Msaada wa karibu, kila wakati",
  "marketing.home.hero.portal.pkg1.name": "Ufikiaji wa Haraka",
  "marketing.home.hero.portal.pkg1.duration": "Saa 1",
  "marketing.home.hero.portal.pkg2.name": "Kifurushi Rahisi",
  "marketing.home.hero.portal.pkg2.duration": "Masaa 3",
  "marketing.home.hero.portal.pkg3.name": "Kifurushi cha Siku",
  "marketing.home.hero.portal.pkg3.duration": "Masaa 24",
  "marketing.home.hero.portal.pkg4.name": "Kifurushi cha Mwezi",
  "marketing.home.hero.portal.pkg4.duration": "Siku 30",
  "marketing.home.hero.portal.pick": "Chagua Kifurushi Chako",
  "marketing.home.hero.portal.pay": "Lipia TZS {amount}",
  "marketing.home.hero.portal.checkout.title": "Kifurushi chako cha WiFi nzuri.",
  "marketing.home.hero.portal.checkout.subtitle": "Lipia kwa mobile money. Unganishwa papo hapo.",
  "marketing.home.hero.portal.checkout.phone": "Namba ya mobile money",
  "marketing.home.hero.portal.checkout.phoneHelp": "Weka 07… / 06… au namba inayoanza na +255.",
  "marketing.home.hero.portal.checkout.total": "Jumla ya kulipa",
  "marketing.home.hero.portal.checkout.providedBy": "Inatolewa na {name}",
  "marketing.home.hero.portal.checkout.terms": "Kwa kuendelea, unakubali masharti ya WiFi.",
  "marketing.home.hero.portal.waiting.title": "Angalia simu yako.",
  "marketing.home.hero.portal.waiting.body":
    "Thibitisha ombi la mobile money kwenye simu yako. Usiweke PIN yako ya mobile money hapa.",
  "marketing.home.hero.portal.connecting.title": "Tunakutafutia nafasi.",
  "marketing.home.hero.portal.connecting.body": "Malipo yamethibitishwa. Tunakuunganisha na {name}…",
  "marketing.home.hero.portal.pushTitle": "M-Pesa",
  "marketing.home.hero.portal.pushBody": "Weka PIN kulipa TZS {amount} kwa ADVO TZ WiFi",
  "marketing.home.hero.portal.requesting": "Inatuma ombi la M-Pesa…",
  "marketing.home.hero.portal.authorizing": "Omada inaruhusu kifaa hiki…",
  "marketing.home.hero.portal.confirmPin": "Thibitisha PIN kwenye simu yako.",
  "marketing.home.hero.portal.connected.eyebrow": "Malipo yamekamilika · WiFi inafanya kazi",
  "marketing.home.hero.portal.connected": "Umeunganishwa.",
  "marketing.home.hero.portal.connectedBody": "Vitu vizuri viko mbali na muunganisho.",
  "marketing.home.hero.portal.browse": "Anza kuvinjari",
  "marketing.home.hero.portal.receiptButton": "Ona risiti",
  "marketing.home.hero.portal.ticket.activePass": "Kifurushi chako kinachotumika",
  "marketing.home.hero.portal.ticket.connected": "Umeunganishwa",
  "marketing.home.hero.portal.ticket.ended": "Imeisha",
  "marketing.home.hero.portal.ticket.device": "kifaa",
  "marketing.home.hero.portal.ticket.voucherPass": "Voucher yako",
  "marketing.home.hero.portal.ticket.validity": "Uhalali",
  "marketing.home.hero.portal.ticket.upTo": "Hadi",
  "marketing.home.hero.portal.ticket.data": "Data",
  "marketing.home.hero.portal.ticket.access": "Ufikiaji",
  "marketing.home.hero.portal.ticket.validUntil": "Ni halali hadi",
  "marketing.home.hero.portal.ticket.paid": "{amount} imelipwa",
  "marketing.home.hero.portal.remaining": "Muda Uliobaki",
  "marketing.home.hero.portal.recovery": "Recovery token imetumwa kwa SMS",
  "marketing.home.hero.portal.secure": "Inalindwa na Advo TZ · Hakuna gharama za ziada",
  "marketing.home.hero.portal.explore.eyebrow": "Ugunduzi kidogo, kwa niaba yetu.",
  "marketing.home.hero.portal.explore.title": "Gundua karibu nawe.",
  "marketing.home.hero.portal.explore.body": "Vitu vya kupenda na ofa zinazostahili kutazamwa.",
  "marketing.home.hero.portal.explore.offer": "Ona ofa",
  "marketing.home.hero.portal.explore.note": "Ugunduzi uliodhaminiwa, ukichaguliwa na AdvoWiFi.",
  "marketing.home.hero.portal.biz1.name": "Sinza Tech Point",
  "marketing.home.hero.portal.biz1.category": "Teknolojia na vifaa",
  "marketing.home.hero.portal.biz1.body": "Vifaa vya sauti, simu na vifaa vingine Sinza.",
  "marketing.home.hero.portal.biz1.location": "Sinza",
  "marketing.home.hero.portal.biz2.name": "Kimara Style Studio",
  "marketing.home.hero.portal.biz2.category": "Uzuri na mitindo",
  "marketing.home.hero.portal.biz2.body": "Muonekano mpya, kipenzi chako, hapa hapa.",
  "marketing.home.hero.portal.biz2.location": "Kimara",
  "marketing.home.hero.portal.shortcut.website": "Gundua Advotz",
  "marketing.home.hero.portal.shortcut.websiteSub": "Kuna zaidi ya kugundua",
  "marketing.home.hero.portal.shortcut.jobs": "Kazi na fursa",
  "marketing.home.hero.portal.shortcut.jobsSub": "Sura yako inayofuata inaanza hapa",
  "marketing.home.hero.portal.shortcut.promote": "Tangaza biashara yako",
  "marketing.home.hero.portal.shortcut.promoteSub": "Julikana katika mtaa wako",
  "marketing.home.hero.portal.poweredBy": "Inaendeshwa na",
  "marketing.home.hero.portal.receipt": "Malipo yamepokelewa",
  "marketing.home.hero.portal.receiptDevice": "Kariakoo Hub · Omada OC200",
  "marketing.home.hero.social.label": "Wamiliki wa WiFi wanaozalisha mapato",
  "marketing.home.hero.social.rating": "4.9/5",
  "marketing.home.hero.social.reviews": "kutoka kwa wamiliki 120+ Tanzania nzima",

  // ── Home · impact stats ──────────────────────────────────────────────────
  "marketing.home.stats.speedValue": "Sekunde 3",
  "marketing.home.stats.speedLabel": "M-Pesa hadi Kuunganishwa",
  "marketing.home.stats.uptimeLabel": "Uthabiti wa Mtandao (Uptime)",
  "marketing.home.stats.ledgerLabel": "Usalama wa Leja ya Kihasibu",
  "marketing.home.stats.lossLabel": "Upotevu wa Mapato au Vocha",

  // ── Home · solutions ─────────────────────────────────────────────────────
  "marketing.home.solutions.badge": "Suluhisho Maalum",
  "marketing.home.solutions.title": "Imetengenezwa Maalum Kwa Kila Aina Ya Biashara Tanzania",
  "marketing.home.solutions.subtitle":
    "Iwe unamiliki mgahawa Kariakoo, hoteli ya watalii Zanzibar au hosteli ya wanafunzi Dodoma, Advo TZ inakupa uwezo kamili wa kudhibiti na kuuza internet.",
  "marketing.home.solutions.cafe.title": "Mikahawa, Bar & Lounges",
  "marketing.home.solutions.cafe.desc":
    "Uza vifurushi vya haraka vya saa 1 au masaa 3 kwa wateja wanaokunywa kahawa au kupata chakula. Wateja wanalipia kwa M-Pesa bila kusumbua wahudumu.",
  "marketing.home.solutions.cafe.feature1": "Captive Portal ya Kujihudumia",
  "marketing.home.solutions.cafe.feature2": "Kupunguza msongamano wa wahudumu",
  "marketing.home.solutions.hotel.title": "Hoteli, Lodges & Resorts",
  "marketing.home.solutions.hotel.desc":
    "Wape wageni wako vocha za bure au vifurushi vya siku kadhaa. Weka nembo na picha ya hoteli yako kwenye ukurasa wa kuingilia (Custom Branding).",
  "marketing.home.solutions.hotel.feature1": "Uchapishaji wa Vocha za Karatasi",
  "marketing.home.solutions.hotel.feature2": "Nembo na picha za Hoteli",
  "marketing.home.solutions.hostel.title": "Hosteli & Makazi ya Vyuo",
  "marketing.home.solutions.hostel.desc":
    "Wanafunzi wanalipia vifurushi vya wiki au mwezi. Dhibiti idadi ya vifaa (Device Limit) kuzuia mwanafunzi mmoja kusambaza internet kwa jengo zima.",
  "marketing.home.solutions.hostel.feature1": "Kikomo cha Vifaa 2 au 3",
  "marketing.home.solutions.hostel.feature2": "Vifurushi vya mwezi na muhula",
  "marketing.home.solutions.wisp.title": "WISPs & Mafundi Mitandao",
  "marketing.home.solutions.wisp.desc":
    "Simamia sites 10 au 50 kutoka kwenye akaunti moja. Unganisha TP-Link Omada Hardware au Software Controller na upokee ripoti za kila site.",
  "marketing.home.solutions.wisp.feature1": "Multi-Site Management",
  "marketing.home.solutions.wisp.feature2": "Kamisheni kwa Mawakala (Agents)",

  // ── Home · how it works ──────────────────────────────────────────────────
  "marketing.home.how.badge": "Mwongozo Rahisi",
  "marketing.home.how.title": "Anza Kuuza WiFi Ndani Ya Hatua Nne Tu",
  "marketing.home.how.subtitle":
    "Huhitaji kuwa mhandisi wa mitandao aliyebobea. Mfumo wetu umebuniwa kufanya kazi kiotomatiki mara moja.",
  "marketing.home.how.step1.title": "Sajili Akaunti Bure",
  "marketing.home.how.step1.desc":
    "Ingiza jina la biashara yako, namba ya simu na barua pepe. Akaunti yako inafunguka papo hapo bila malipo ya awali.",
  "marketing.home.how.step2.title": "Unganisha Omada",
  "marketing.home.how.step2.desc":
    "Weka maelezo ya Controller yako (OC200, OC300 au PC). Mfumo unawasiliana na vifaa vyako kwa usalama kamili.",
  "marketing.home.how.step3.title": "Weka Vifurushi Vyako",
  "marketing.home.how.step3.desc":
    "Panga bei kwa Shilingi ya Kitanzania (TZS). Weka vifurushi vya Saa 1, Masaa 3, Siku 1, au Mwezi kulingana na wateja wako.",
  "marketing.home.how.step4.title": "Kusanya Mapato Kiotomatiki",
  "marketing.home.how.step4.desc":
    "Wateja wanalipia kwa M-Pesa na kuunganishwa mara moja. Toa fedha zako muda wowote kuelekea kwenye simu yako!",
  "marketing.home.how.cta": "Fungua Akaunti Yako Ya Majaribio Sasa",

  // ── Home · features deep dive ────────────────────────────────────────────
  "marketing.home.features.badge": "Uwezo wa Mfumo",
  "marketing.home.features.title":
    "Teknolojia Ya Hali Ya Juu Inayolinda Kila Senti Ya Biashara Yako",
  "marketing.home.features.subtitle":
    "Tumeboresha kila kipengele cha usalama, uhasibu na udhibiti wa mtandao ili uendeshe biashara yako kwa amani ya moyo popote ulipo duniani.",
  "marketing.home.features.ledger.title":
    "Leja ya Kihasibu Isiyofutika (Append-Only Double-Entry)",
  "marketing.home.features.ledger.desc":
    "Tofauti na mifumo mingine inayofuta kumbukumbu, Advo TZ inatumia mfumo wa benki wa leja pacha. Hakuna salio linaloweza kuongezwa au kupunguzwa bila muamala kamili unaoacha stakabadhi isiyofutika.",
  "marketing.home.features.omada.title": "Ushirikiano wa Asili na TP-Link Omada SDN",
  "marketing.home.features.omada.desc":
    "Hakuna script dhaifu za Mikrotik zinazogoma wakati wa msongamano. Advo TZ inafanya kazi moja kwa moja na Omada Open API, ikiruhusu na kusimamisha vifaa kwa wakati sahihi sekunde kwa sekunde.",
  "marketing.home.features.device.title": "Kikomo cha Vifaa Mahiri & Recovery ya Chaji",
  "marketing.home.features.device.desc":
    "Mteja akizima simu au kubadili kifaa, hatapoteza pesa yake. Mfumo wetu unatoa Recovery Token inayomruhusu kuunganisha kifaa kipya ndani ya kikomo cha vifaa alicholipia.",
  "marketing.home.features.vouchers.title": "Vocha za Kuchapisha & QR Codes",
  "marketing.home.features.vouchers.desc":
    "Tengeneza batch ya vocha 50 au 1,000 kwa sekunde moja. Zina kodi fupi za tarakimu na QR code kwa ajili ya wateja wanaotaka kuscan kwa kamera. Export kwa CSV au chapisha moja kwa moja.",
  "marketing.home.features.agents.title": "Mfumo wa Mawakala (Kamisheni za Kila Mwezi)",
  "marketing.home.features.agents.desc":
    "Wape motisha mafundi na wafanyabiashara wanaoleta wamiliki wapya wa WiFi. Mawakala wanapata hadi 15% ya malipo ya kila mwezi kiotomatiki kupitia mfumo wetu wa Referral Attributions.",
  "marketing.home.features.reports.title": "Ripoti za Wakati Halisi & Utoaji wa Fedha",
  "marketing.home.features.reports.desc":
    "Tazama kila kifaa kilichopo mtandaoni, bandwidth inayotumika, na jumla ya fedha zilizokusanywa. Toa fedha zako papo hapo kuelekea M-Pesa / Tigo Pesa muda wowote unaotaka.",

  // ── Home · pricing preview ───────────────────────────────────────────────
  "marketing.home.pricing.badge": "Gharama Nafuu",
  "marketing.home.pricing.title": "Vifurushi Vya Kuanzia Biashara Yako",
  "marketing.home.pricing.subtitle":
    "Chagua kifurushi kinacholingana na ukubwa wa biashara yako. Hakuna mikataba ya lazima ya muda mrefu—unaweza kubadili muda wowote.",

  // ── Home · testimonials ──────────────────────────────────────────────────
  "marketing.home.testimonials.badge": "Ushuhuda wa Wateja",
  "marketing.home.testimonials.title": "Wanachosema Wamiliki Wa Biashara Tanzania",
  "marketing.home.testimonials.subtitle":
    "Gundua jinsi wenzako wanavyopata faida ya kila siku kupitia Advo TZ.",
  "marketing.home.testimonials.1.quote":
    "Tulikuwa tunapoteza zaidi ya laki tatu kila mwezi kwa sababu ya vocha za karatasi kupotea na wahudumu kugawa password bure. Tangu tuweke Advo TZ kwenye mgahawa wetu Kariakoo, wateja wanalipia kwa M-Pesa wenyewe na kila shilingi inaonekana kwenye simu yangu.",
  "marketing.home.testimonials.1.role": "Mmiliki, City Bistro · Kariakoo, DSM",
  "marketing.home.testimonials.2.quote":
    "Kwenye lodge yetu Zanzibar, wageni wengi wanataka internet yenye kasi na inayojiunga bila maswali mengi. Omada + Advo TZ imekuwa mkombozi. Mteja anachagua saa 24, anapokea prompt ya simu na kuunganishwa mara moja bila kwenda reception.",
  "marketing.home.testimonials.2.role": "Meneja wa Uendeshaji · Nungwi, Zanzibar",
  "marketing.home.testimonials.3.quote":
    "Mimi ni fundi wa mitandao (Network Installer). Nimeunganisha zaidi ya wateja 12 kwenye mfumo wa Advo TZ kama Agent. Kila mwezi napata kamisheni yangu moja kwa moja kwenye wallet yangu bila kucheleweshwa. Ni chanzo kizuri sana cha kipato cha ziada.",
  "marketing.home.testimonials.3.role": "IT Specialist & Advo Agent · Arusha",

  // ── Home · closing CTA ───────────────────────────────────────────────────
  "marketing.home.cta.badge": "Usikubali Kupoteza Mapato Tena",
  "marketing.home.cta.title":
    "Anza Kupokea Malipo Ya WiFi Moja Kwa Moja Kwenye Simu Yako Leo",
  "marketing.home.cta.body":
    "Inachukua dakika mbili tu kusanidi akaunti yako. Unganisha TP-Link Omada yako sasa na uone jinsi inavyofanya kazi bure bila malipo yoyote ya awali.",
  "marketing.home.cta.register": "Fungua Akaunti Yako Bure",
  "marketing.home.cta.contact": "Ongea Na Timu Yetu",

  // ── Pricing page ─────────────────────────────────────────────────────────
  "marketing.pricing.badge": "Bei Rahisi & Uwazi Kamili",
  "marketing.pricing.title": "Vifurushi Vinavyokua Pamoja Na Biashara Yako",
  "marketing.pricing.subtitle":
    "Bei zote ni kwa Shilingi ya Kitanzania (TZS). Hakuna ada za siri au makato yasiyotambulika. Lipia kila mwezi kwa M-Pesa au Tigo Pesa.",
  "marketing.pricing.popular": "Inayopendwa Zaidi",
  "marketing.pricing.guarantee.title":
    "Jaribu Mfumo Bure Kwa Siku {days} Bila Malipo Ya Awali",
  "marketing.pricing.guarantee.body":
    "Fungua akaunti, anza jaribio la bure la siku {days} kwenye {plan}, unganisha TP-Link Omada yako na ujaribu mauzo ya WiFi kwenye mazingira yako halisi. Kama haitakidhi matarajio yako, huna wajibu wa kuendelea.",
  "marketing.pricing.guarantee.cta": "Anza Majaribio",
  "marketing.pricing.guarantee.ctaNoTrial": "Fungua Akaunti",
  "marketing.pricing.guarantee.noTrial.title": "Hakuna Ada Ya Kujiunga Wala Mkataba",
  "marketing.pricing.guarantee.noTrial.body":
    "Fungua akaunti, unganisha TP-Link Omada yako na ujaribu mauzo ya WiFi kwenye mazingira yako halisi. Huna wajibu wa kuendelea.",

  // ── Orodha ya vifurushi (inavutwa kutoka Admin) ──────────────────────────
  // Ukweli unatoka kwa API; maneno pekee yanasimamiwa hapa, hivyo lugha mpya
  // haihitaji mabadiliko ya API.
  "marketing.plans.sites": "Site",
  "marketing.plans.devices": "Access Points",
  "marketing.plans.packages": "Packages / site",
  "marketing.plans.unlimited": "Bila Kikomo",
  "marketing.plans.capacity": "Uwezo",
  "marketing.plans.included": "Kilichojumuishwa",
  "marketing.plans.trial": "Siku {days} za majaribio bure",
  "marketing.plans.noTrial": "Hakuna majaribio bure",
  "marketing.plans.perPeriod": "kwa siku {days}",
  "marketing.plans.perMonth": "kwa mwezi",
  "marketing.plans.demo": "Bei ya Demo",
  "marketing.plans.adFree": "Ahadi ya Bila Matangazo",
  "marketing.plans.ads.none": "Hakuna matangazo kabisa",
  "marketing.plans.ads.optional": "Wewe unaamua matangazo yanaonekana lini",
  "marketing.plans.ads.required": "Matangazo ya wadhamini yanahitajika",
  "marketing.plans.colors": "Rangi na logo yako mwenyewe",
  "marketing.plans.badgeRemovable": "Ondoa nembo ya Advo",
  "marketing.plans.voucher": "Kutumia vocha",
  "marketing.plans.orderEdit": "Kupanga upya packages za WiFi",
  "marketing.plans.cardStyles": "Mitindo {count} ya kadi za packages",
  "marketing.plans.unlimitedSites": "Site na vifaa bila kikomo",
  "marketing.plans.choose": "Chagua kifurushi hiki",
  "marketing.plans.contact": "Wasiliana na timu yetu",
  "marketing.plans.empty": "Bei mpya inakamilishwa. Wasiliana na timu yetu kwa bei maalum.",

  // ── Features page ────────────────────────────────────────────────────────
  "marketing.features.badge": "Vipengele vya Kina",
  "marketing.features.title":
    "Kila Kitu Unachohitaji Kusimamia Mtandao Wako wa WiFi",
  "marketing.features.subtitle":
    "Advo TZ inaunganisha teknolojia ya mtandao ya TP-Link Omada na mifumo ya malipo ya simu ya Tanzania (M-Pesa, Tigo Pesa, Airtel Money, Halopesa) kutoa uzoefu wa kipekee kwa wateja na mmiliki.",
  "marketing.features.portal.title": "Captive Portal ya Kisasa ya Simu",
  "marketing.features.portal.desc":
    "Wateja wanaojiunga na WiFi wanapata ukurasa wa kisasa unaofunguka papo hapo. Ukurasa huu unawaonyesha vifurushi vya muda, bei halisi kwa TZS, na kuwaruhusu kulipia kwa M-Pesa au kadi ya vocha bila kuuliza nenosiri.",
  "marketing.features.portal.feature1": "Push notification ya haraka ya USSD",
  "marketing.features.portal.feature2": "Nembo na picha za biashara yako",
  "marketing.features.portal.feature3": "Lugha za Kiswahili na Kiingereza",
  "marketing.features.omada.title": "Ushirikiano wa TP-Link Omada SDN",
  "marketing.features.omada.desc":
    "Mfumo unaungana moja kwa moja na Controllers zote za Omada: Hardware Controllers (OC200, OC300) au Software Controllers. Mfumo unawasiliana na Controller kuruhusu MAC address za wateja waliolipia na kuwazima muda ukiisha.",
  "marketing.features.omada.feature1": "Hakuna mikrotik scripts zinazofeli",
  "marketing.features.omada.feature2":
    "Udhibiti wa kasi (Bandwidth limit per user)",
  "marketing.features.omada.feature3": "Ufuatiliaji wa hali ya kila Access Point",
  "marketing.features.vouchers.title": "Vocha za Karatasi Zenye Barcode & QR",
  "marketing.features.vouchers.desc":
    "Zalisha vocha 100 au 1,000 kwa sekunde moja. Kila vocha ina namba fupi inayosomeka kirahisi au QR code inayoweza kuskaniwa na simu ya mteja. Unaweza kuuza kwa fedha taslimu (Cash) mezani au dukani.",
  "marketing.features.vouchers.feature1": "Uchapishaji wa kadi zenye nembo yako",
  "marketing.features.vouchers.feature2":
    "Export ya CSV kwa programu za mauzo (POS)",
  "marketing.features.vouchers.feature3": "Kufuta vocha ambazo hazijatumika",
  "marketing.features.ledger.title": "Leja ya Fedha ya Kihasibu (Double-Entry)",
  "marketing.features.ledger.desc":
    "Kila malipo ya simu yanagawanywa kiuhasibu (Gross Sale, Network Provider Fee, Platform Fee, na Net Payable ya Mmiliki). Database inakataa kufuta au kubadili rekodi yoyote, ikihakikisha leja inabaki daima ikiwa balanced.",
  "marketing.features.ledger.feature1": "Usalama wa kiwango cha kibenki",
  "marketing.features.ledger.feature2": "Ripoti za kina za ukaguzi (Audit Log)",
  "marketing.features.ledger.feature3": "Utoaji salama wa fedha (Withdrawals)",
  "marketing.features.devices.title": "Kikomo cha Vifaa (Device Limits) & Roaming",
  "marketing.features.devices.desc":
    "Zuia wateja kusambaza vocha moja kwa mtaa mzima. Kila kifurushi kinaweza kuwekewa kikomo maalum (mfano kifaa 1 kwa mteja wa kawaida, au vifaa 2 kwa mteja wa VIP). Mteja anatembea kutoka Access Point moja hadi nyingine bila kukatika.",
  "marketing.features.devices.feature1": "Seamless Roaming kwenye jengo lote",
  "marketing.features.devices.feature2":
    "Battery recovery token mteja akizima simu",
  "marketing.features.devices.feature3": "Kulinda bandwidth isitumike hovyo",
  "marketing.features.agents.title": "Mfumo wa Mawakala (Agent Network)",
  "marketing.features.agents.desc":
    "Kuza biashara yako kwa kuwashirikisha mafundi wa mitandao au mawakala wa mauzo. Mawakala wanapewa kodi maalum za rufaa na dashibodi yao, wakipokea kamisheni za kila mwezi kiotomatiki wakati wateja wao wanapolipa ada zao.",
  "marketing.features.agents.feature1": "Recurring commission ya kila mwezi",
  "marketing.features.agents.feature2": "Utoaji wa kamisheni kuelekea M-Pesa",
  "marketing.features.agents.feature3": "Ufuatiliaji wa wateja walioletwa",
  "marketing.features.cta.title": "Uko Tayari Kuanza Kutumia Vipengele Hivi?",
  "marketing.features.cta.body":
    "Jiunge na mamia ya biashara zinazotumia Advo TZ kuendesha mtandao wao kwa ufanisi na usalama.",
  "marketing.features.cta.register": "Fungua Akaunti Bure",
  "marketing.features.cta.pricing": "Tazama Bei za Vifurushi",

  // ── Contact page ─────────────────────────────────────────────────────────
  "marketing.contact.badge": "Msaada & Ushauri",
  "marketing.contact.title": "Wasiliana Na Timu Ya Advo TZ",
  "marketing.contact.subtitle":
    "Je, una maswali kuhusu jinsi ya kusanidi vifaa vyako vya TP-Link Omada au kuchagua kifurushi sahihi? Tuko hapa kukusaidia kuanza.",
  "marketing.contact.details.title": "Taarifa za Mawasiliano",
  "marketing.contact.details.office": "Ofisi Kuu",
  "marketing.contact.details.phone": "Simu & WhatsApp",
  "marketing.contact.details.hours": "Inapatikana masaa yote",
  "marketing.contact.details.email": "Barua Pepe",
  "marketing.contact.details.emailResponse": "Majibu ndani ya saa 2",
  "marketing.contact.details.installTitle": "Ufundi wa Omada Mahali Ulipo:",
  "marketing.contact.details.installBody":
    "Kama unahitaji mafundi waliosajiliwa wa kufanya installation ya TP-Link Omada eneo lako, tujulishe tutakuunganisha na Agent wa karibu.",
  "marketing.contact.success.title": "Asante! Ujumbe Wako Umepokelewa.",
  "marketing.contact.success.body":
    "Mtaalamu wetu wa mitandao ya WiFi atawasiliana nawe kupitia namba yako ya simu ndani ya muda mfupi.",
  "marketing.contact.success.again": "Tuma ujumbe mwingine",
  "marketing.contact.form.title": "Tuma Ujumbe au Omba Ushauri wa Bure",
  "marketing.contact.form.name": "Jina Lako Kamili",
  "marketing.contact.form.namePlaceholder": "Mfano: Daudi John",
  "marketing.contact.form.business": "Jina la Biashara / Hoteli",
  "marketing.contact.form.businessPlaceholder": "Mfano: Sunset Lounge",
  "marketing.contact.form.phone": "Namba ya Simu (WhatsApp)",
  "marketing.contact.form.phonePlaceholder": "07XX XXX XXX",
  "marketing.contact.form.venueType": "Aina ya Biashara",
  "marketing.contact.form.venue.cafe": "Mgahawa au Bar",
  "marketing.contact.form.venue.hotel": "Hoteli au Lodge",
  "marketing.contact.form.venue.hostel": "Hosteli au Wanafunzi",
  "marketing.contact.form.venue.wisp": "WISP / Mfanyabiashara wa Internet",
  "marketing.contact.form.venue.agent": "Ninataka Kuwa Agent (Wakala)",
  "marketing.contact.form.message": "Ujumbe au Maswali Yako",
  "marketing.contact.form.messagePlaceholder":
    "Eleza idadi ya Access Points ulizonazo au swali lolote ulilonalo...",
  "marketing.contact.form.submit": "Tuma Ujumbe Sasa",

  // ── FAQ ──────────────────────────────────────────────────────────────────
  "marketing.faq.badge": "Maswali Yanayoulizwa Mara kwa Mara",
  "marketing.faq.title": "Kila Kitu Unachohitaji Kujua Kuhusu Advo TZ",
  "marketing.faq.subtitle":
    "Una swali lingine? Timu yetu ya wataalamu ipo tayari kukusaidia saa 24.",
  "marketing.faq.q1": "Je, nahitaji vifaa gani vya TP-Link Omada ili kuanza?",
  "marketing.faq.a1":
    "Unahitaji TP-Link Omada Controller (iwe hardware kama OC200, OC300, au Software Controller inayoendeshwa kwenye kompyuta/VPS) pamoja na Access Point yoyote ya TP-Link Omada EAP (kama EAP110, EAP225, EAP610 n.k.). Advo TZ inaungana moja kwa moja na Controller yako kupitia Open API na Hotspot Operator.",
  "marketing.faq.q2": "Pesa za mauzo ya WiFi zinaniingiaje kwenye simu yangu?",
  "marketing.faq.a2":
    "Wateja wanaponunua vifurushi kwa M-Pesa, Tigo Pesa, Airtel Money au Halopesa, fedha zinaingia kwenye Wallet yako ya Advo TZ mara moja zikiwa zimerekodiwa kwenye leja ya fedha (Double-Entry Ledger). Unaweza kutoa (withdraw) pesa yako papo hapo kuelekea namba yako ya simu ya mkononi.",
  "marketing.faq.q3":
    "Je, vipi kuhusu wateja wanaopendelea kulipa fedha taslimu (Cash)?",
  "marketing.faq.a3":
    "Advo TZ inakuwezesha kuzalisha na kuchapisha Vocha za karatasi (Vouchers) zenye kodi fupi au QR Code kwa mbofyo mmoja. Mhudumu wako anaweza kuwauzia wageni vocha hizi kwa pesa taslimu, na mteja anaiweka kwenye portal bila kuhitaji namba ya simu.",
  "marketing.faq.q4":
    "Nini kinatokea iwapo simu ya mteja itazima au kubadili kifaa?",
  "marketing.faq.a4":
    "Mfumo una kipengele maalum cha 'Recovery Token'. Mteja anapata kiungo kwenye risiti yake kinachomruhusu kuunganisha kifaa chake kipya au simu nyingine ndani ya kikomo cha vifaa (Device Limit) cha kifurushi chake bila kulipa mara ya pili.",
  "marketing.faq.q5":
    "Je, ninaweza kugawa mawakala (Agents) wa kunisaidia kusambaza mtandao?",
  "marketing.faq.a5":
    "Ndio kabisa! Advo TZ ina mfumo kamili wa Mawakala. Unaweza kusajili mawakala watakaopewa kodi maalum za rufaa (Referral Codes) na viungo vya mialiko, wakipata kamisheni ya kila mwezi kiotomatiki wakati wateja wanaendelea kutumia mfumo.",
  "marketing.faq.q6": "Je, mfumo unazuia vipi wizi na mianya ya pesa?",
  "marketing.faq.a6":
    "Tofauti na mifumo ya kizamani inayotegemea script dhaifu za Mikrotik, Advo TZ inatumia mfumo wa uhasibu wa kimataifa (Append-only Double-Entry Ledger). Hakuna mtu anayeweza kubadili au kufuta rekodi ya muamala. Kila shilingi na kila sekunde ya mteja ina uthibitisho kamili wa kodi na stakabadhi.",

  // ── Interactive revenue calculator ───────────────────────────────────────
  "marketing.calculator.venue.cafe": "Mikahawa & Bar",
  "marketing.calculator.venue.hotel": "Hoteli & Lodges",
  "marketing.calculator.venue.hostel": "Hosteli & Wanafunzi",
  "marketing.calculator.venue.wisp": "WISP & Mitaani",
  "marketing.calculator.badge": "Kikokotoo cha Mapato",
  "marketing.calculator.title":
    "Utaingiza Shilingi Ngapi Kwa Mwezi Kupitia WiFi Yako?",
  "marketing.calculator.subtitle":
    "Tumia vitelezi (sliders) hapa chini kuhesabu makadirio ya mapato kulingana na idadi ya wateja na bei ya vifurushi vyako.",
  "marketing.calculator.dailyUsers.label": "Wateja Wanaolipia kwa Siku:",
  "marketing.calculator.guestsValue": "Wateja {count}",
  "marketing.calculator.guestsTick": "wateja {count}",
  "marketing.calculator.avgPrice.label": "Wastani wa Bei ya Kifurushi:",
  "marketing.calculator.note":
    "Hesabu zote zinategemea siku 30 za mwezi na makato ya kawaida ya mitandao ya simu.",
  "marketing.calculator.result.dailyGross": "Mauzo ya Jumla kwa Siku:",
  "marketing.calculator.result.monthlyGross": "Mauzo ya Mwezi (Gross):",
  "marketing.calculator.result.fees": "Makato ya Mobile Money & Mfumo:",
  "marketing.calculator.result.netProfit":
    "Faida Yako Halisi Mfukoni (Net Profit):",
  "marketing.calculator.result.yearly":
    "Kwa mwezi mmoja tu, unaweza kujiingizia zaidi ya TZS {amount} kwa mwaka!",
  "marketing.calculator.cta": "Anza Kuzalisha Mapato Haya Leo",

  // ── Marketing footer ─────────────────────────────────────────────────────
  "marketing.footer.introLead":
    "Mfumo namba moja Tanzania wa kusimamia na kuuza internet ya WiFi kwa ushirikiano na",
  "marketing.footer.introOmada": "TP-Link Omada SDN",
  "marketing.footer.introTrail":
    "Wateja wanalipia kwa M-Pesa, Tigo Pesa, Airtel Money, na Halopesa au Vocha za karatasi na kuunganishwa papo hapo.",
  "marketing.footer.pill.ledger": "Leja ya Kihasibu",
  "marketing.footer.pill.omada": "Tayari kwa TP-Link Omada",
  "marketing.footer.pill.noTheft": "100% Hakuna Wizi wa Vocha",
  "marketing.footer.products.title": "Bidhaa",
  "marketing.footer.products.portal": "Captive Portal ya Simu",
  "marketing.footer.products.omada": "Ushirikiano wa Omada SDN",
  "marketing.footer.products.vouchers": "Uchapishaji wa Vocha",
  "marketing.footer.products.ledger": "Wallet & Ledger ya Fedha",
  "marketing.footer.products.agents": "Mfumo wa Mawakala (Agents)",
  "marketing.footer.customers.title": "Wateja Wetu",
  "marketing.footer.customers.hotels": "Hoteli, Lodges & Resorts",
  "marketing.footer.customers.cafes": "Mikahawa, Bar & Lounges",
  "marketing.footer.customers.hostels": "Hosteli & Wanafunzi",
  "marketing.footer.customers.wisp": "ISP & WISP Resellers",
  "marketing.footer.customers.calculator": "Kikokotoo cha Mapato",
  "marketing.footer.contact.title": "Mawasiliano",
  "marketing.footer.status": "Mifumo Yote Inafanya Kazi (99.98%)",
  "marketing.footer.rights": "Haki zote zimehifadhiwa.",
  "marketing.footer.bottom.pricing": "Vifurushi & Bei",
  "marketing.footer.bottom.login": "Ingia kwenye Akaunti",
  "marketing.footer.bottom.hotspots": "Hotspots Zetu",
  "marketing.footer.bottom.services": "Huduma",

  // ── Our Hotspots page ────────────────────────────────────────────────────
  "marketing.hotspots.badge": "Tafuta Advo WiFi",
  "marketing.hotspots.title": "Hotspots Zetu",
  "marketing.hotspots.subtitle":
    "Maeneo nchini Tanzania ambapo Advo WiFi inapatikana — chunguza ramani au tafuta kwa jiji.",
  "marketing.hotspots.searchPlaceholder": "Tafuta kwa jina, jiji, au aina…",
  "marketing.hotspots.allCities": "Miji yote",
  "marketing.hotspots.count": "Hotspots {count}",
  "marketing.hotspots.countOne": "Hotspot 1",
  "marketing.hotspots.empty": "Bado hakuna hotspots za kuonyesha. Rudi baadaye.",
  "marketing.hotspots.emptyFilter": "Hakuna hotspots zinazolingana na utafutaji wako.",
  "marketing.hotspots.selectHint": "Chagua eneo kwenye ramani au kwenye orodha.",
  "marketing.hotspots.visitPortal": "Fungua portal ya wageni",
  "marketing.hotspots.mapLabel": "Ramani ya hotspots",
  "marketing.hotspots.listLabel": "Orodha ya hotspots",

  // ── Services (guest Explore menu) ────────────────────────────────────────
  "marketing.services.badge": "Explore ya WiFi ya wageni",
  "marketing.services.title": "Huduma",
  "marketing.services.subtitle":
    "Gundua biashara, matukio, ofa na fursa za karibu ukishaunganishwa kwenye AdvoWiFi.",
  "marketing.services.explore.eyebrow": "Kwenye captive portal",
  "marketing.services.explore.title": "Menyu ya Explore",
  "marketing.services.explore.lead":
    "Gundua yaliyo karibu nawe — kutoka biashara na matukio hadi fursa muhimu na msaada.",
  "marketing.services.items.businesses.title": "Biashara na ofa za karibu",
  "marketing.services.items.businesses.body":
    "Gundua maduka, mikahawa na huduma za karibu. Angalia wanachotoa na upate sehemu zinazostahili kutembelewa.",
  "marketing.services.items.advotz.title": "Tembelea Advotz.com",
  "marketing.services.items.advotz.body":
    "Tembelea Advotz ugundue biashara, huduma na fursa zaidi.",
  "marketing.services.items.events.title": "Matukio ya karibu",
  "marketing.services.items.events.body":
    "Pata matamasha, sherehe, masoko, michezo na matukio ya jamii yanayoendelea karibu nawe.",
  "marketing.services.items.holidays.title": "Likizo",
  "marketing.services.items.holidays.body":
    "Gundua mawazo ya likizo, safari za wikendi, ofa za usafiri na sehemu za kuvutia za kutembelea.",
  "marketing.services.items.jobs.title": "Kazi & Fursa",
  "marketing.services.items.jobs.body":
    "Gundua nafasi za kazi, programu za mafunzo na fursa nyingine. Soma maelezo na jifunze jinsi ya kuomba.",
  "marketing.services.items.promote.title": "Tangaza biashara yako",
  "marketing.services.items.promote.body":
    "Unataka wateja zaidi wagundue biashara yako? Uliza kuhusu matangazo kwenye AdvoWiFi na timu yetu itawasiliana nawe.",
  "marketing.services.items.help.title": "Msaada",
  "marketing.services.items.help.body":
    "Unahitaji msaada kuunganishwa au kutumia AdvoWiFi? Wasiliana na timu yetu ya msaada.",
  "marketing.services.local.eyebrow": "Ndani ya Biashara za Karibu",
  "marketing.services.local.title": "Mfano wa huduma za karibu",
  "marketing.services.local.lead":
    "Gundua huduma za karibu na mahitaji ya kila siku yaliyo karibu nawe.",
  "marketing.services.local.mpesa.name": "Wakala wa M-Pesa & Kibenki",
  "marketing.services.local.mpesa.category": "Teknolojia & Fedha",
  "marketing.services.local.mpesa.body":
    "Pata mawakala wa simu na benki wa karibu kwa kuweka, kutoa pesa na miamala mingine.",
  "marketing.services.local.cafe.name": "Kahawa & Vyakula vya Karibu",
  "marketing.services.local.cafe.category": "Vyakula & Mikahawa",
  "marketing.services.local.cafe.body":
    "Furahia kahawa iliyochemshwa upya, chai, vitafunio vitamu, juisi za kuburudisha na vyakula vitamu.",
  "marketing.services.local.phones.name": "Duka la Vifaa vya Simu",
  "marketing.services.local.phones.category": "Teknolojia & Simu",
  "marketing.services.local.phones.body":
    "Nunua chaja za simu, kebo, vioo vya kinga, earphone, power bank na vifaa vingine.",
  "marketing.services.local.pharmacy.name": "Duka la Dawa & Afya",
  "marketing.services.local.pharmacy.category": "Maduka & Huduma",
  "marketing.services.local.pharmacy.body":
    "Pata maduka ya dawa yenye dawa, huduma ya kwanza na bidhaa za afya za kila siku.",

};

export const marketingCatalog = { en: marketingEn, sw: marketingSw };
