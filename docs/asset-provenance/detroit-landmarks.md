# Detroit landmark asset provenance

2026-10-01 · Engineering guidance, not legal advice. Feature-specific record, not a product-wide rights review.

## Asset policy

All enabled geometry and paired 2D silhouettes must be independently authored local components built from simple forms. Reference pages identify the subjects and recognition features; their photos are not bundled, traced into assets or redistributed. No downloaded models, logos, seals, murals, theatre artwork, detailed sculptural reliefs or vendor branding. A schematic portrait is not a street map. Identification is not endorsement or evidence of ownership, returns, traffic or economic impact.

| Runtime ID (or blocked requested ID) | Identity/reference | Recognition decision | Final local status |
| --- | --- | --- | --- |
| renaissance-center | https://detroithistorical.org/learn/encyclopedia-of-detroit/renaissance-center ; https://portmanarchitects.com/project/renaissance-center/ | Cylindrical hotel; four octagonal offices with slender cylindrical circulation cores; two lower rectangular eastern towers; connected podium and river-facing Wintergarden | Initial depiction rejected by user; corrected pair implemented and native-render reviewed; no renewed user sign-off claimed |
| michigan-central | https://detroithistorical.org/learn/encyclopedia-of-detroit/michigan-central-station ; https://michigancentral.com/ | Long classical base plus tall rectangular office block; restored treatment | Paired authored components implemented and native-render reviewed |
| fox-theatre | https://detroithistorical.org/learn/encyclopedia-of-detroit/fox-theatre | Street-front massing and marquee; independently typeset FOX, no copied logo | Paired authored components implemented and native-render reviewed |
| guardian-building | https://detroithistorical.org/learn/encyclopedia-of-detroit/guardian-building | Stepped Art Deco profile, geometric entrance, no copied artwork | Paired authored components implemented and native-render reviewed |
| penobscot-building | https://detroithistorical.org/learn/encyclopedia-of-detroit/penobscot-building | Stepped crown/mast, no friezes | Paired authored components implemented and native-render reviewed |
| ambassador-bridge | https://detroithistorical.org/learn/encyclopedia-of-detroit/ambassador-bridge | Suspension structure with towers, deck and main cable | Paired authored components implemented and native-render reviewed |
| eastern-market | https://www.easternmarket.org/ | Market shed/stalls, no murals or vendor brands | Paired authored components implemented and native-render reviewed |
| spirit-of-detroit | https://detroithistorical.org/learn/encyclopedia-of-detroit/spirit-detroit ; https://marshallfredericks.org/spirit-of-detroit/ | Requested seated figure with orb/family composition | **Blocked. Not in runtime allowlist or planner shortlist. No placeholder.** |

The approved plan inspected these sources on 2026-10-01 for identity and scope, not a blanket licence. New verification observations are recorded below separately.

## Spirit of Detroit gate

The sculpture remains a named requested deliverable. Independent geometry, public location, attribution and educational explanation do not by themselves establish a right to redistribute a derivative model in commercial software and generated videos. Museum imagery reproduction procedures are not blanket sculpture/model permission.

Before enabling this asset, record a defensible rights basis or permission covering both software redistribution and generated outputs. A qualified rights review or permission may be required; no external outreach or cost is authorized. Until resolved, preserve the storyboard and blocked status, omit the asset from runtime, and proceed with independent architecture/landmarks. Do not substitute an anonymous person or robot.

Rights/reproduction reference pages in the approved research:

- https://marshallfredericks.org/learn/archives-research/
- https://marshallfredericks.org/wp-content/uploads/2021/03/Rights-and-Reproductions-Image-Request.pdf

## Rights check performed on 2026-10-01 (step 3)

Web search for the museum's sculpture reuse terms returned no usable results. Direct authoritative pages above were readable. The Spirit page identifies the artist and 1958 dedication and describes conservation, not an unrestricted reuse grant. The archives page describes research and image reproduction procedures. The four-page image request form requires written requests, describes limited one-time/edition/language image use and electronic use assessed case by case. None of these pages establishes a licence for independently authored derivative 3D/2D sculpture assets redistributed in software and generated videos.

Decision: **rights basis not established; Spirit remains blocked**. Do not interpret the image terms as a blanket grant or as a definitive legal conclusion about all depictions. Required human prerequisite before implementation: supply documented permission or a qualified rights determination covering the intended asset and output uses. No museum request, payment, outreach, model creation or asset download was made. Continue the independent work with the sculpture excluded, as the approved plan permits; the full requested pack cannot be called complete.

## Implementation verification

Steps 6–9 implemented seven authored 3D/2D pairs. Actual component-tree CPU mesh accounting passes: RenCen 51, Michigan Central 28, Fox 27, Guardian 14, Penobscot 13, Ambassador Bridge 52, Eastern Market 20. Catalog/recognition/mesh tests: 11 passed; standalone Remotion TypeScript check passed. These counts exclude the shared studio and do not measure GPU resources. Corrected native visual recognition/render evidence is recorded below.

Step 10 follows the approved blocked branch: no `SpiritOfDetroit.tsx`, no runtime ID, no placeholder or substitute. Catalog tests reject `spirit-of-detroit`. No external photos, models or artwork have been downloaded into the repository.

## RenCen recognition correction after user feedback

The initial depiction incorrectly made all seven main towers cylindrical. Counting seven separated towers was insufficient visual evidence. On 2026-10-01, the following were viewed for architectural recognition, not traced or bundled:

- Portman Architects' project page and its exterior photographs `New_Slider01-24.jpg`, `New_Slider02-20.jpg`, and `New_Slider03-12.jpg` (page paths under `/wp-content/uploads/2019/03/`). These show the faceted offices, slim circular circulation cores, tall central hotel, two lower eastern blocks, and unified podium. The photographed 1988 riverfront is not treated as a claim about current tenants or future redevelopment.
- Detroit Historical Society's collection photographs `2009019444c.JPG` and `2010033255.JPG`, linked from its RenCen article, and the article's description of the five-story Wintergarden addition. The site's default social preview photograph is unrelated historic downtown imagery and was not used as a RenCen reference.
- SAH Archipedia search result `https://sah-archipedia.org/buildings/MI-01-WN7` corroborated the cylindrical hotel/four octagonal-office description; its full page returned HTTP 403, so no full-page review is claimed. Hines' project page also returned 403.

Temporary reference viewing files are outside git at `C:\Users\Groot\AppData\Local\Temp\rencen-reference-i1gfrm`. No reference image is imported into a scene, placed in resources, traced, or redistributed. Geometry remains independently authored, stylized, and not survey-accurate. The seven-building composition depicts the existing landmark pack, not a speculative demolition/redevelopment plan. Fine facade divisions suggest architecture; they are not a countable floor survey. Corrected runtime mesh count remains 51 under the original ceiling of 56, with facade detail batched rather than one mesh per window.

## Final native-render evidence

Agent visual review of every enabled clay/2D pair is complete on Windows native ANGLE, with light/dark and both aspect ratios. The corrected RenCen remains dominant in the city portrait; long-condition projection tests protect its crown and labels. These are recognition-oriented, independently authored interpretations, not a new user approval or a survey of exact dimensions.

Final bundle: `C:\Users\Groot\AppData\Local\Temp\explainer-stills-1Fpb95`, SHA-256 `94a0cff250ca7ea4ff42eb7ee33d0c7a94cdb3e5f7e2e24ed255481c080635ad`. Detroit stills: `explainer-stills-cTWK4y` (144 cases / 864 stills); final gallery videos: `hybrid-showcase-S43QrF/gallery-9x16.mp4` and `gallery-16x9.mp4`, all under the same Temp root. Full artifact, timing, production-route and limitation details are in [the verification record](../plans/detroit-hybrid-explanation-verification.md).

The gallery contains the seven **enabled** landmarks only. Spirit is still explicitly blocked; nothing in these completed render proofs establishes its reuse rights. No downloaded photograph, logo, model or sculpture has become a runtime asset.
