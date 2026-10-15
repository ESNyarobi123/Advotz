# AdvoWiFi — Plans na udhibiti wa features

**Aina:** Product requirements + mwongozo wa implementation  
**Toleo:** 1.0 · 5 Oktoba 2026  
**Lengo:** Admin aweze kuunda plans, kuamua features za kila plan, na mfumo utekeleze ruhusa hizo kwenye dashboard ya reseller na captive portal.

> Admin anaamua reseller anaruhusiwa kufanya nini kupitia plan. Reseller anachagua muonekano ndani ya ruhusa hizo. Backend ndiyo inayothibitisha ruhusa; frontend inaonyesha matokeo yake.

Hii ni specification ya kujenga mfumo. Majina ya plans ni mifano na bei zitawekwa na admin. Vipengele vilivyoelezwa hapa bado vinahitaji implementation ya backend na frontend; HTML iliyotengenezwa awali ni prototype ya UI.

## 1. Tofauti ya reseller plan na WiFi package

| Jina | Maana | Anayetengeneza | Mfano |
|---|---|---|---|
| **Reseller plan** | Subscription ya reseller ya kutumia AdvoWiFi; inaamua features na limits zake | Admin | Sponsored, Brand Control, Ad Free |
| **WiFi package** | Kifurushi cha internet kinachonunuliwa na mteja kwenye captive portal | Reseller | Saa 3, TSh 2,000, hadi 3 Mbps |

Kubadilisha reseller plan hakubadilishi moja kwa moja bei, muda au speed za WiFi packages zake. Plan inaamuyesa uwezo wake wa kusimamia mfumo na kubadili muonekano.

**Scope ya mwanzo:** reseller mmoja ana subscription moja inayotumika kwenye sites zake zote. Kila site inaweza kuwa na branding na portal preferences zake, lakini haiwezi kuvuka ruhusa za plan ya reseller.

## 2. Plans zitakavyofanya kazi

1. Admin anatengeneza plan, anaweka jina, bei, billing period, features na limits.
2. Reseller anachagua au anapangiwa plan hiyo. Subscription inahifadhi toleo la plan analotumia.
3. Dashboard inasoma ruhusa halisi za subscription yake.
4. Reseller anabadilisha logo, rangi na card style pale plan inapomruhusu.
5. Captive portal inapokea configuration iliyohakikiwa na backend: branding, packages na sehemu zinazotakiwa kuonekana.
6. Ads za admin zinaonekana kulingana na policy ya plan, uchaguzi unaoruhusiwa wa reseller, na campaigns zilizochapishwa.

**Usiandike logic kama `if plan.name === "Premium"`.** Tumia feature keys na policy values. Admin akibadili jina la plan, behavior ibaki sawa.

## 3. Udhibiti wa ads unahitaji modes tatu

Switch ya ON/OFF pekee haiwezi kutofautisha “matangazo ya lazima” na “reseller anaruhusiwa kuchagua”. Kila ad placement iwe na mode yake.

| Mode | Admin anamaanisha nini? | Portal inaonyesha nini? | Reseller anaweza kubadili? |
|---|---|---|---|
| **REQUIRED** | Sehemu hii ni sehemu ya lazima ya makubaliano ya plan | Inaonyesha eligible ads zikipatikana | Hapana; toggle inaonekana ikiwa locked |
| **OPTIONAL** | Plan inaruhusu reseller kuchagua | Inaonyesha au kuficha kulingana na preference yake | Ndiyo; ON/OFF |
| **DISABLED** | Sehemu hii imeondolewa kwenye plan | Sehemu haionekani na ads zake haziletwi kwenye public response | Hapana; hawezi kuiwasha |

**Mfano unaotakiwa:** reseller wa plan ya kwanza anaweza kubadili brand, colors na package card style, lakini banner na Explore zinabaki `REQUIRED`. Reseller wa plan nyingine anapewa `OPTIONAL`, hivyo anaweza kuzima zote.

Admin anaweza pia kutengeneza plan yenye `DISABLED` ikiwa anataka portal isiwe na matangazo kabisa tangu mwanzo.

### Sehemu zinazodhibitiwa tofauti

| Feature key | Sehemu ya UI | Aina ya control |
|---|---|---|
| `ads.banner` | Sliding banner juu ya jina, description na packages | REQUIRED / OPTIONAL / DISABLED |
| `ads.explore` | Sponsored business cards chini ya “You’re connected” | REQUIRED / OPTIONAL / DISABLED |
| `discovery.promote_business` | Kitufe cha “Promote your business” | REQUIRED / OPTIONAL / DISABLED |
| `discovery.platform_link` | Kitufe/link ya kwenda kwenye website ya platform | REQUIRED / OPTIONAL / DISABLED |
| `discovery.jobs` | Jobs & opportunities | REQUIRED / OPTIONAL / DISABLED |

Banner na Explore ndizo placements za campaign katika toleo la kwanza. Controls za `discovery.*` zinaamua kuonekana kwa shortcuts zilizopo chini ya connected page. Campaign mpya ikiongezwa kwenye sehemu nyingine baadaye, lazima sehemu hiyo iwe na policy inayotambulika pia.

### Kitufe cha “Hide ads & discovery”

- Kionekane ikiwa banner, Explore na discovery shortcuts zote tano zinaweza kufichwa: kila moja iwe `OPTIONAL` au tayari `DISABLED`.
- Kikibonyezwa, preferences za banner, Explore, Promote your business, platform link na Jobs zilizo `OPTIONAL` ziwekwe OFF katika ombi moja.
- `DISABLED` zibaki zimefichwa; hakuna preference inayohitajika kuzizima tena.
- Ikiwa kuna sehemu yoyote kati ya hizo iliyo `REQUIRED`, usionyeshe kitufe kinachoahidi kuficha zote. Onyesha individual controls zinazokubalika na locked controls za lazima.
- Reseller anaweza pia kuzima banner na Explore pekee, huku Jobs ikibaki ON, kupitia individual controls. Jobs yenye sponsored listings izingatie pia ahadi ya Ad Free.
- **Hide all** haifichi packages, payment button, reseller name, support, receipt au taarifa za session.

## 4. Mifano ya plans za kuanzia

Majina haya ni presets tu. Admin anaweza kuunda plans zaidi, kutumia majina yake na kubadili feature values bila kubadilisha code ya kila plan.

| Uwezo | Sponsored | Brand Control | Ad Free |
|---|---|---|---|
| Reseller name, description, location na support | Ndiyo | Ndiyo | Ndiyo |
| Kupakia reseller logo | ON | ON | ON |
| Kubadili brand colors | ON | ON | ON |
| Card styles zinazopatikana | Classic, Compact | Classic, Compact, Soft, Outlined | Classic, Compact, Soft, Outlined |
| Kupanga mpangilio wa WiFi packages | OFF | ON | ON |
| Banner ads | REQUIRED | OPTIONAL | DISABLED |
| Explore ads | REQUIRED | OPTIONAL | DISABLED |
| Promote your business shortcut | OPTIONAL | OPTIONAL | DISABLED |
| Platform website shortcut | OPTIONAL | OPTIONAL | DISABLED |
| Jobs & opportunities | OPTIONAL | OPTIONAL | DISABLED katika preset hii |
| Reseller kuficha ads zote | Hapana | Ndiyo | Tayari zimefichwa |
| Kuondoa “Powered by AdvoWiFi” | OFF | OFF | OFF; admin anaweza kuruhusu kivyake |
| Voucher login | ON | ON | ON |
| Bei na billing period | Admin anaweka | Admin anaweka | Admin anaweka |
| Sites, devices na package limits | Admin anaweka | Admin anaweka | Admin anaweka |

**Ad Free na white label ni ruhusa tofauti.** Kuondoa ads hakumaanishi automatic kuondoa platform attribution. Admin anaweza kuwasha `branding.platform_badge_removable` kwenye plan yoyote anayoamua.

Plan ikiuzwa kama **Ad Free**, mfumo uthibitishe kwamba kila sponsored placement imewekwa `DISABLED`. Shortcut inayopeleka kwenye matangazo isitumike kurudisha ads kupitia sehemu nyingine. Admin akichagua modes zinazokinzana, plan isichapishwe ikiwa bado imewekewa ahadi ya `ad_free`.

## 5. Feature catalog ya customization

Admin anachagua features zilizojengwa tayari. Admin haandiki feature key mpya bila implementation halafu switch yake ionekane kana kwamba inafanya kazi.

| Feature key | Aina | Inachoruhusu | Behavior ikiwa haijaruhusiwa |
|---|---|---|---|
| `branding.logo_upload` | Boolean | Kupakia au kubadili logo ya reseller | Tumia default network icon; usifute logo iliyohifadhiwa |
| `branding.colors_edit` | Boolean | Kuchagua primary na accent colors | Tumia default theme ya plan |
| `package_cards.allowed_styles` | Allowlist | Styles ambazo reseller anaweza kuchagua | Style moja pekee inaonyesha fixed style; hakuna uchaguzi mwingine |
| `package_cards.default_style` | Enum | Style inayotumika ikiwa reseller hajachagua | Lazima iwe ndani ya allowed styles |
| `packages.order_edit` | Boolean | Kubadili mpangilio wa packages anazomiliki | Tumia default order, bila kufuta order ya zamani |
| `branding.platform_badge_removable` | Boolean | Kuficha “Powered by AdvoWiFi” | Platform badge inaendelea kuonekana |
| `payments.voucher` | Boolean | Kuonyesha voucher login na kuruhusu voucher redemption mpya | Ficha voucher login na kataa redemption mpya kupitia API |

### Aina za package cards

| Style | Muonekano uliopendekezwa |
|---|---|
| `classic` | Card safi yenye duration, price, speed na CTA |
| `compact` | Card ndogo inayopunguza nafasi bila kuondoa taarifa muhimu |
| `soft` | Card yenye background laini inayofuata brand colors |
| `outlined` | Card yenye border na muonekano mwepesi |

Styles zote zitumie data ileile ya package: jina, bei, muda, speed, data allowance na device allowance. Reseller habadili billing logic kwa kubadili card style.

### Branding inayobaki msingi wa huduma

Reseller name, description, location na support zionekane kwa usahihi katika kila plan. Mabadiliko haya yanahitaji ownership validation; si features za premium. WiFi packages zinabaki za reseller huyo, hata pale ads zinapotoka kwa admin.

Colors na styles zitumie templates zilizotengenezwa. Reseller asipewe arbitrary CSS/JavaScript kwenye toleo hili, kwa sababu inaweza kuficha required placements au kuharibu checkout. Hakiki contrast ya text, buttons na background kabla ya kuhifadhi theme.

### Features ambazo lazima zijengwe upande wa backend pia

- `payments.voucher = false`: backend ikatae **redemption mpya**, hata mtu akiita endpoint moja kwa moja.
- `branding.colors_edit = false`: backend ikatae updates za colors zinazotoka kwa reseller.
- Style isiyo kwenye allowlist: backend ikatae kuichagua na public config itumie allowed default.
- `ads.banner = DISABLED`: ad service isirudishe banner creatives kwa portal hiyo.
- `ads.explore = REQUIRED`: preference ya reseller ya kuficha Explore ikataliwe.

Kuficha kitufe kwenye frontend pekee hakukamilishi feature control.

## 6. Limits za plan

Hizi ni optional numeric controls ambazo admin anaweza kujumuisha kwenye plan editor.

| Key | Maana | Thamani |
|---|---|---|
| `limits.sites` | Idadi ya sites zinazoweza kusajiliwa na reseller | Integer ≥ 1, au `null` kwa unlimited |
| `limits.devices` | Jumla ya managed devices zinazoweza kuongezwa kwa reseller | Integer ≥ 1, au `null` |
| `limits.wifi_packages_per_site` | Idadi ya active WiFi packages kwa site | Integer ≥ 1, au `null` |

Usitumie `0` kumaanisha unlimited. UI ionyeshe chaguo la “Unlimited” wazi. Device limit hapa ni ya vifaa vya mtandao vinavyomanagewa, si idadi ya simu za wateja zinazotumia WiFi.

Reseller akizidi limit baada ya downgrade, usifute sites, devices au packages zake automatic. Onyesha over-limit status na zuia kuongeza mpya hadi idadi iwe ndani ya limit au afanye upgrade. Session ambayo mteja tayari amelipia isikatwe kutokana na mabadiliko haya ya subscription.

## 7. Admin UI — kutengeneza na kusimamia plan

**Menu:** `Admin → Plans → Create plan`

### A. General

- Plan name na maelezo mafupi.
- Price in TZS; admin anaweza kuweka free ikiwa model ya biashara inaruhusu.
- Billing period na trial days ikiwa zitatumika.
- Visibility: public kwa reseller kuchagua, au private kwa admin assignment.
- Lifecycle: Draft, Published au Archived.
- Optional commercial promise: `standard` au `ad_free`.

### B. Branding & package appearance

- Allow logo upload: toggle.
- Allow custom colors: toggle.
- Default primary/accent colors: color inputs.
- Allowed card styles: multiselect yenye angalau style moja.
- Default card style: selection kutoka kwenye allowlist.
- Allow package reordering: toggle.
- Allow removal of platform badge: toggle.

### C. Ads & discovery

Kwa kila feature ya section 3, admin achague mode kutoka dropdown yenye labels:

- **Required — reseller cannot turn off**
- **Optional — reseller can turn on/off**
- **Disabled — section unavailable**

`OPTIONAL` iwe na default visibility ya ON au OFF. `REQUIRED` visibility yake ni ON; `DISABLED` ni OFF, kwa hiyo defaults zisiruhusiwe kuleta contradiction.

### D. Other features & limits

- Voucher login: toggle.
- Limits za sites, devices na packages.
- Features ambazo hazijajengwa zionyeshwe kama “Planned” na zisichagulike kwenye plan inayochapishwa.

### E. Preview & publish

Admin aone:

1. Customer portal preview: reseller branding, card style na banner visibility.
2. Connected preview: session details, Explore na bottom shortcuts.
3. Reseller settings preview: controls zinazoruhusiwa na zile locked.
4. Summary ya mabadiliko na resellers watakaoathirika kabla ya kuchapisha.

**Save Draft** isibadili live behavior. **Publish** ithibitishe configuration na itengeneze published version.

## 8. Reseller UI — controls anazopata

**Menu:** `Reseller → Portal appearance`

| Sehemu | Mfano wa control | Ikiwa plan imezuia |
|---|---|---|
| Identity | Name, description, location, support | Inaruhusiwa kwa site anayomiliki |
| Logo | Upload / replace / remove | Locked, pamoja na maelezo ya plan |
| Colors | Primary na accent | Locked; onyesha theme inayotumika |
| Package cards | Visual style thumbnails | Onyesha allowed styles; nyingine zinaweza kuonekana locked |
| Package order | Drag/reorder | Locked ikiwa feature iko OFF |
| Banner | Show banner ON/OFF | REQUIRED: ON + locked; DISABLED: OFF + unavailable |
| Explore | Show Explore ON/OFF | REQUIRED: ON + locked; DISABLED: OFF + unavailable |
| Discovery shortcuts | Individual visibility toggles | Zifuate mode ya kila shortcut |
| Platform badge | Show platform badge ON/OFF | Locked ON ikiwa removal hairuhusiwi |

**Mfano wa locked message:** “Banner ads are included in your current plan and cannot be turned off.”

**Mfano wa optional message:** “Your plan lets you show or hide sponsored content.”

“Save changes” ihifadhi tu fields anazoruhusiwa. Reseller asiwe na uwezo wa kubadili plan features, plan price, campaign ownership au mode ya ad placement kupitia endpoint hii.

## 9. Namna ya kukokotoa effective configuration

Backend itofautishe vitu vitatu:

- **Plan entitlement:** uwezo ambao plan inatoa.
- **Reseller preference:** uchaguzi wa reseller ndani ya uwezo huo.
- **Effective config:** matokeo yaliyothibitishwa ambayo dashboard na captive portal zinatumia.

### Visibility rule

```text
resolveVisibility(mode, resellerPreference, optionalDefault):
    REQUIRED -> visible = true,  canEdit = false
    DISABLED -> visible = false, canEdit = false
    OPTIONAL -> visible = resellerPreference ?? optionalDefault,
                canEdit = true
```

`false` iliyo katika preference ni chaguo halali. Isibadilishwe kuwa default ON kwa kutumia fallback inayochukulia `false` kama missing value.

### Campaign rule

```text
renderPlacement = effectiveVisibility AND eligibleCampaigns.length > 0
```

Campaign ihesabiwe eligible ikiwa imechapishwa na iko active, tarehe zake zinaruhusu, placement inalingana na targeting inajumuisha reseller/site hiyo.

- `REQUIRED` haina maana ya kuonyesha banner tupu kama hakuna campaign.
- Ads zikikosekana au fetch yake ikishindwa, collapse sehemu hiyo bila kuzuia packages au malipo.
- Hakuna lazima ya kubonyeza au kusubiri ad ili kununua kifurushi au kuanza kutumia session.
- Reseller colors zibadilishe UI yake; zisibadilishe creative ya advertiser bila admin kuchagua hivyo.

### Order ya maamuzi

1. Thibitisha site na reseller mwenye site hiyo.
2. Pata subscription na published plan version inayotumika.
3. Soma feature values na defaults zake.
4. Tumia reseller preferences pale tu entitlement inaruhusu.
5. Tumia campaign schedule, targeting na eligibility.
6. Rudisha effective public config na ads zinazoruhusiwa kuonekana.

Public request isikubali `planId`, `canHideAds` au role inayotumwa na mteja kama chanzo cha ruhusa.

## 10. Mfano wa plan configuration

Hii ni schema ya ndani inayopendekezwa, si endpoint au schema rasmi ya Snippe/Omada. Mfano huu unalenga features, si full published record. Bei na billing period zinawekwa na admin na kuhifadhiwa kwenye plan version pamoja na features.

```json
{
  "planKey": "brand-control",
  "version": 1,
  "state": "published",
  "commercialPromise": "standard",
  "features": {
    "branding": {
      "logo_upload": true,
      "colors_edit": true,
      "platform_badge_removable": false,
      "default_primary_color": "#172D43",
      "default_accent_color": "#F06638"
    },
    "package_cards": {
      "allowed_styles": ["classic", "compact", "soft", "outlined"],
      "default_style": "classic"
    },
    "packages": {
      "order_edit": true
    },
    "ads": {
      "banner": { "mode": "OPTIONAL", "default_visible": true },
      "explore": { "mode": "OPTIONAL", "default_visible": true }
    },
    "discovery": {
      "promote_business": { "mode": "OPTIONAL", "default_visible": true },
      "platform_link": { "mode": "OPTIONAL", "default_visible": true },
      "jobs": { "mode": "OPTIONAL", "default_visible": true }
    },
    "payments": {
      "voucher": true
    },
    "limits": {
      "sites": 3,
      "devices": 10,
      "wifi_packages_per_site": 12
    }
  }
}
```

Namba za limits hapo ni mfano wa format pekee, si uamuzi wa pricing au capacity ya system.

### Mabadiliko yanayotengeneza presets nyingine

| Preset | Mabadiliko kutoka kwenye mfano |
|---|---|
| Sponsored | `ads.banner.mode` na `ads.explore.mode` = `REQUIRED`; styles = `classic, compact`; `packages.order_edit = false` |
| Ad Free | `commercialPromise = ad_free`; `ads.*.mode = DISABLED`; `discovery.promote_business`, `discovery.platform_link` na `discovery.jobs` = `DISABLED`; defaults zake = false |

Defaults za `REQUIRED` ziwe true; za `DISABLED` ziwe false. Admin bado anaweza kubadili branding permissions na limits bila kuvunja kanuni hizo.

### Mfano wa reseller preference

```json
{
  "branding": {
    "primary_color": "#143E35",
    "accent_color": "#ECA535",
    "show_platform_badge": true
  },
  "package_cards": {
    "style": "soft"
  },
  "visibility": {
    "banner": false,
    "explore": false,
    "promote_business": false,
    "platform_link": false,
    "jobs": true
  }
}
```

Reseller huyo akitumia Brand Control, banner na Explore zinafichwa. Akihamishwa kwenda Sponsored, preferences zake za false zinaweza kuhifadhiwa, lakini effective visibility ya banner na Explore inakuwa true na controls zinakuwa locked. Akirudi kwenye plan inayoruhusu, uchaguzi wake wa zamani unaweza kutumika tena.

## 11. Data model inayopendekezwa

| Entity | Data muhimu | Jukumu |
|---|---|---|
| `plans` | id, plan_key, name, catalog_description, visibility, lifecycle | Plan inayopatikana kwenye catalog ya admin |
| `plan_versions` | id, plan_id, version, price, currency, billing_period, trial_days, features_json, commercial_promise, published_at | Snapshot ya commercial terms na features; published version haisahihishwi kimya kimya |
| `reseller_subscriptions` | reseller_id, plan_version_id, status, starts_at, ends_at, pending_change | Inaonyesha plan halisi inayotumika sasa na change iliyopangwa |
| `site_portal_preferences` | site_id, branding_json, package_style, package_order, visibility_json | Uchaguzi wa reseller, ukihifadhiwa tofauti na plan |
| `ad_campaigns` | creative, status, dates, placements, targeting | Matangazo yanayotengenezwa na admin |
| `audit_events` | actor, action, entity, previous_value, new_value, timestamp | Historia ya plan, subscription na policy changes |

Feature catalog iwe registry yenye keys, types, allowed values, defaults na handler/module inayotekeleza kila feature. Unknown key au feature isiyotekelezwa ikataliwe wakati wa kuchapisha plan.

**Version boundaries:** bei, billing period, trial terms na features zihifadhiwe katika published version ileile inayorejelewa na subscription. Bei mpya au feature changes zitengeneze version mpya. Mfumo usisome bei inayobadilika kutoka catalog kisha kuitumia kimya kimya kwa subscription ya zamani.

Kwa toleo la kwanza, epuka per-reseller feature overrides zisizo na mpangilio. Ikiwa anahitaji exception, admin atengeneze private plan yenye ruhusa hizo ili source ya entitlement ibaki wazi.

## 12. Endpoints za ndani zinazopendekezwa

Majina haya ni design proposal ya backend ya AdvoWiFi.

| Endpoint | Mtumiaji | Kazi |
|---|---|---|
| `POST /api/admin/plans` | Admin | Kuunda draft plan |
| `PATCH /api/admin/plans/:planId/draft` | Admin | Kubadili metadata na feature configuration ya draft |
| `POST /api/admin/plans/:planId/publish` | Admin | Validate, version na publish |
| `POST /api/admin/plans/:planId/preview` | Admin | Kuona effective config ya draft bila kuiweka live |
| `POST /api/admin/resellers/:resellerId/plan-changes` | Admin | Assign/change plan sasa au tarehe iliyopangwa |
| `GET /api/reseller/entitlements` | Reseller | Effective features, limits na reason za locked controls |
| `PATCH /api/reseller/sites/:siteId/portal-preferences` | Reseller | Kubadili settings anazoruhusiwa kwa site yake |
| `GET /api/portal/sites/:publicSiteKey/config` | Public portal | Branding, package display settings na effective visibility |
| `GET /api/portal/sites/:publicSiteKey/ads?placement=banner` | Public portal | Ads eligible za placement inayoonekana; Explore hutumia `placement=explore` |

Public config isirudishe secrets, admin settings, private targeting rules au data ya reseller mwingine. Ad endpoint irudishe empty list ikiwa placement imefichwa; isirudishe creatives halafu itegemee frontend kuzificha.

**Rejected update example:** reseller mwenye REQUIRED banner akituma `visibility.banner = false`, rudisha `403` yenye code `FEATURE_LOCKED_BY_PLAN` na reason inayoeleweka. Ombi la updates nyingi liwe atomic: usihifadhi baadhi kimya kimya na kukataa nyingine bila reseller kujua.

## 13. Kubadili plan na subscription lifecycle

### Admin akibadili features za plan

- Save Draft haiathiri subscribers.
- Publish inatengeneza version mpya.
- Admin achague scope ya version mpya: subscribers wapya tu, subscribers waliopo kwenye renewal, au migration ya selected/all subscribers kwa effective date anayoamua.
- UI ionyeshe scope na mabadiliko kabla ya migration. Backend ihifadhi old/new version na effective date.
- Hakuna subscription inayobadilishiwa published feature snapshot bila operation hiyo kurekodiwa.

### Upgrade

Subscription iliyothibitishwa ihamie kwenye version mpya kwa effective date. Baada ya hapo reseller apate controls mpya na portal itumie policy mpya. Usifungue features kutokana na frontend payment-success message pekee; backend ndiyo ihakikishe upgrade.

### Downgrade

- Hifadhi custom logo, colors, style na visibility preferences za zamani.
- Tumia effective defaults pale mpya haiziruhusu.
- Style isiyoruhusiwa ibadilike kwenda default ya plan mpya, bila kuondoa preference iliyohifadhiwa.
- Ads zilizo REQUIRED zionekane tena ikiwa kuna eligible campaign.
- Taarifa za package ambayo mteja tayari alinunua na muda wake wa session zibaki kama zilivyokubaliwa.

### Expiry, grace period na suspension

Admin afafanue behavior hizi kwenye subscription policy. Zisiwe switch inayofichwa ndani ya ad feature. Kama kuna fallback plan, iwe configured wazi. Usihamishe reseller wa Ad Free kwenda Sponsored automatic kwa sababu config fetch imefeli.

Kuzima voucher feature kunakata redemption mpya; voucher/session ambayo tayari ime-activate inaendelea hadi muda wake wa kawaida. Kuzima feature au kubadili plan hakufuti campaign, branding assets au customer payment records.

## 14. Configuration refresh na kushindwa kwa huduma

- Effective config iwe na `config_revision` au version token.
- Plan migration, subscription change au portal preference change i-invalidate cache ya reseller/sites zilizoathirika.
- Campaign updates zi-invalidate ad cache; cache eligibility iangalie pia mwanzo na mwisho wa scheduled campaign.
- Public cache key izingatie site, entitlement/config revision na placement. Usitumie global cache ya banner inayorudisha content ileile kwa plans zote.
- Backend ihakiki ruhusa kila update/redemption; dashboard ya zamani isitumie stale UI kuvuka plan.
- Ads zikishindwa kupatikana, portal iendelee na packages/checkout; eneo la ads lisibaki na blank card kubwa.
- Config ikishindwa, last-known validated config inaweza kutumika kwa muda mfupi ulioamuliwa. Bila config halali ya site na packages, onyesha retry badala ya kutengeneza permissions au bei.

## 15. Kutoka kwenye prototype kwenda implementation

Prototype ya `AdvoWiFi_Portal_Redesign.html` ina `reseller.agreement` yenye `both`, `banner` na `explore`, pamoja na `agreementAllows()` ya kuchagua placement. Hii inatosha kwa preview, lakini haitofautishi compulsory ads na reseller-controlled ads.

Mabadiliko yanayohitajika kwenye implementation:

1. Badilisha simple agreement value na published plan entitlements.
2. Tenganisha `ads.banner.mode` na `ads.explore.mode`.
3. Ongeza persisted preferences za reseller kwa OPTIONAL placements.
4. Tumia effective config kutoka backend kuendesha UI.
5. Hamisha Ads Manager kwenye admin route yenye role checks za backend.
6. Badilisha demo campaigns za browser na campaign data inayotolewa na backend.
7. Endelea kuonyesha package details kwanza kwenye connected page; discovery ibaki chini yake.

Snippe checkout na Omada authorization zibaki kwenye purchase/session flow. Hali ya ad visibility isibadilishe package entitlement ya mteja au kuthibitisha payment.

## 16. Acceptance criteria — features zikubalike zikifanya kazi

| Jaribio | Matokeo yanayotakiwa |
|---|---|
| Admin anatengeneza plan mpya yenye jina jipya | Behavior inatokana na features; hakuna code mpya ya kutambua jina la plan |
| Sponsored reseller anabadilisha logo, color na allowed card style | Muonekano unabadilika; banner na Explore vinabaki kama plan inavyotaka |
| Sponsored reseller anajaribu kuficha REQUIRED ads kupitia API | Update inakataliwa; policy haibadiliki |
| Brand Control reseller anazima banner pekee | Banner inafichwa; Explore na packages vinaendelea kawaida |
| Brand Control reseller anatumia Hide ads & discovery | Banner, Explore, Jobs, platform link na promotion shortcut zinafichwa pamoja |
| Admin anaweka banner/explore DISABLED | Public portal haionyeshi wala kupokea creatives za placements hizo |
| Reseller anachagua card style isiyopo kwenye plan | API inakataa; portal inaendelea na style inayoruhusiwa |
| Admin anazima color customization | Color update mpya inakataliwa; effective theme inarudi kwenye plan defaults |
| Admin anazima voucher login | Button inafichwa na redemption mpya inakataliwa; existing paid sessions haziathiriki |
| Hakuna ads active au ad fetch inashindwa | Hakuna blank ad area; kununua package na kuconnect kunaendelea |
| Campaign ipo active lakini audience yake ni reseller mwingine | Haionekani kwenye portal hii |
| Reseller anafanya downgrade | Stored preferences zinabaki; effective behavior inafuata plan mpya |
| Admin anahifadhi draft ya plan | Live subscribers hawaathiriki |
| Admin anapublish na kupanga migration | Changes zinatumika kwa scope na muda uliowekwa; audit ina old/new values |
| Reseller anabadilisha URL/body kujaribu site ya mwingine | Ownership check inakataa ombi |
| Admin anaandika unknown feature key au contradictory Ad Free configuration | Publish inakataliwa kwa error inayoeleweka |
| Config cache bado ina version ya zamani baada ya plan change | Invalidation/version check inazuia kuendelea kutoa permissions au ads zisizolingana |

## 17. Mpangilio wa kujenga

1. **Feature catalog + plan editor:** types, defaults, validation, draft/publish na feature matrix.
2. **Subscriptions + entitlement resolver:** subscription version, effective config na backend guards.
3. **Reseller appearance settings:** branding, allowed styles, locked states na OPTIONAL visibility controls.
4. **Ads delivery:** campaign eligibility, audience targeting, policy-aware fetching na empty states.
5. **Lifecycle + verification:** upgrade/downgrade, configuration refresh na acceptance cases za section 16.

**Kigezo cha kukamilika:** admin akibadili feature kwenye published plan version na kuitumia kwa reseller, dashboard, API na captive portal zote zionyeshe behavior ileile. Switch isiishie kuwa mapambo ya UI.
