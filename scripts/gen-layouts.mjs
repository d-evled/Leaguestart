#!/usr/bin/env node
/**
 * Generates crates/core/data/poe1/layouts.json — one entry per campaign zone
 * with layout notes for the Layouts page and the Bottlenecks cross-link.
 *
 * CONTENT PROVENANCE: every summary/tip below is an ORIGINAL, condensed
 * write-up of widely-known community routing knowledge (zone shapes, exit
 * rules, waypoint habits, trial/quest stops). It is deliberately NOT copied
 * from any guide site — external guides with full maps and images (e.g.
 * definitivguide.com) are *linked* per zone instead of reproduced. If you
 * have the author's permission to embed richer text, edit the entries here
 * and re-run `npm run gen:layouts`; per-zone `guideUrl` overrides the
 * search-based external link when you know the exact page.
 *
 * `consistency`: 1 = fixed/near-fixed layout, 2 = variable but rule-based,
 * 3 = high variance ("layout RNG" zones worth deliberate practice).
 *
 * Entries are keyed by (act, zone name) and joined against areas.json —
 * the script fails if any campaign zone is missing notes or any note has
 * no matching zone, so the two files can't drift apart.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GAME = "poe1";
const AREAS_PATCH = "3.26";

const SOURCE = {
  name: "Definitiv Guide",
  url: "https://www.definitivguide.com/docs/category/path-of-exile-1",
};

// L(summary, [tips], consistency, guideUrl?)
const L = (summary, tips, consistency, guideUrl = null) => ({
  summary,
  tips,
  consistency,
  guideUrl,
});

const NOTES = {
  1: {
    "The Twilight Strand": L(
      "One straight beach into town — zero layout variance.",
      [
        "Kill only what blocks the lane; Hillock guards the town gate and has to die.",
        "Treat it as your movement warm-up: pathing habits here set the tone for the run.",
      ],
      1,
    ),
    "The Coast": L(
      "Long strip between cliffs and sea; progress runs parallel to the water.",
      [
        "Hold the upper (cliff) edge — the Mud Flats exit is at the far end, up the rise.",
        "Waypoint usually sits on the path past the midpoint; tag it in stride.",
        "Tidal Island juts off the beach side — only detour if you're taking Mercy Mission (Quicksilver Flask).",
      ],
      2,
    ),
    "The Tidal Island": L(
      "Small island loop; Hailrake camps the far tip.",
      [
        "Sweep one side of the loop straight to Hailrake, grab the Medicine Chest, then logout/portal back.",
        "The Quicksilver Flask reward is the biggest early movement upgrade — worth the detour on most routes.",
      ],
      2,
    ),
    "The Mud Flats": L(
      "Open flats; three Rhoa mounds hold the glyphs that unlock the way forward.",
      [
        "The mounds ring the middle of the zone — clear the closest three and ignore everything else.",
        "The Submerged Passage door sits on the far edge; the Fetid Pool is a separate dead-end loop.",
        "Rhoa charges are the main death risk this early — keep moving, don't get surrounded.",
      ],
      3,
    ),
    "The Fetid Pool": L(
      "Small bog dead-end loop — purely optional.",
      [
        "If routed: circle the pool one way, clear the ritual mobs, and leave.",
        "On fast runs skip it; the time cost rarely pays for itself.",
      ],
      2,
    ),
    "The Submerged Passage": L(
      "Flooded cave; a plank bridge crosses the chasm mid-zone.",
      [
        "Follow the water channel to the bridge, then push straight to the far stairs (The Ledge).",
        "The Flooded Depths (Deep Dweller, +1 passive) branches off the lower pools — take it while leveling, skip when racing.",
      ],
      2,
    ),
    "The Flooded Depths": L(
      "Compact cave; the Deep Dweller sits in the far pool.",
      [
        "Kill the Dweller and portal out — the turn-in pays a passive skill point.",
      ],
      2,
    ),
    "The Ledge": L(
      "The classic one-lane cliff shelf.",
      [
        "Commit to one direction along the shelf — the exit is at the top end.",
        "Packs tend to come at you from the direction you should be heading; use them as a compass.",
      ],
      1,
    ),
    "The Climb": L(
      "S-shaped mountain trail with one real fork.",
      [
        "Stay on the worn path; the side pockets are loot bait, not progress.",
        "The Lower Prison entrance is the lit gatehouse at the top of the trail.",
      ],
      2,
    ),
    "The Lower Prison": L(
      "Rectangular prison floor; the stairs up sit across the floor from the entrance.",
      [
        "Run the outer corridor instead of threading cells.",
        "Trial of Ascendancy #1 is here — take it now; it's on the Normal lab checklist.",
      ],
      2,
    ),
    "The Upper Prison": L(
      "Cell blocks funneling toward Brutus.",
      [
        "Push forward room to room — Brutus' arena is the far end, and Prisoner's Gate opens behind him.",
      ],
      2,
    ),
    "Prisoner's Gate": L(
      "Canyon road running downhill; everything hangs off the road.",
      [
        "Follow the road — the Ship Graveyard exit is past the gate at the low end.",
        "Tag the waypoint for the Act 6 revisit (it hosts a trial then).",
      ],
      2,
    ),
    "The Ship Graveyard": L(
      "Wide wreck-littered beach — the act's most variable zone.",
      [
        "Hug the waterline instead of weaving between hulls; the Cavern of Wrath entrance reads from far away.",
        "The Ship Graveyard Cave (Allflame / Marooned Mariner, +1 passive) hides among the wrecks — leveling yes, racing no.",
        "If you're lost, pick an edge and commit — wandering the middle is the classic time sink here.",
      ],
      3,
    ),
    "The Ship Graveyard Cave": L(
      "Short cave loop beneath the wrecks.",
      [
        "Finish The Marooned Mariner here for the passive point, then portal out.",
      ],
      2,
    ),
    "The Cavern of Wrath": L(
      "Winding sea cave descending toward Merveil.",
      [
        "Follow the water downhill; at forks the wider tunnel is usually the way.",
        "No waypoint on this level — don't die deep without a portal.",
      ],
      2,
    ),
    "The Cavern of Anger": L(
      "Second cave layer ending at Merveil; Act 2 lies behind her.",
      [
        "Tag the waypoint on the way through, then push to the boss arena.",
        "Clear a small pocket before engaging Merveil on squishier builds — her adds punish clutter.",
      ],
      2,
    ),
  },
  2: {
    "The Southern Forest": L(
      "Forest road along the river, straight up to the Encampment.",
      [
        "Stay on the road — it runs to the town gate.",
        "Tag the waypoint for the Act 6 return trip.",
      ],
      1,
    ),
    "The Old Fields": L(
      "Broad field between forest walls; Crossroads on the far side.",
      [
        "Cross roughly straight — the exit is opposite your entrance more often than not.",
        "The Den pops up mid-field; enter only if your route uses it.",
      ],
      2,
    ),
    "The Den": L(
      "Burrow loop with the Great White Beast at its heart.",
      [
        "It's one ring — pick a direction, kill the Beast, portal out.",
      ],
      2,
    ),
    "The Crossroads": L(
      "Four-way hub under the ruined aqueduct — the act's junction.",
      [
        "Waypoint at the central crossing; tag it before any branch.",
        "North bridge → Broken Bridge (Kraityn). Uphill ruins → Chamber of Sins. South road → Fellshrine and the Crypt.",
      ],
      1,
    ),
    "The Broken Bridge": L(
      "Short dead-end at the collapsed span; Kraityn camps it.",
      [
        "Straight shot along the road — resolve Kraityn per your bandit plan and leave.",
      ],
      1,
    ),
    "The Fellshrine Ruins": L(
      "Road to a ruined church; the Crypt sits beneath it.",
      [
        "Follow the road, not the woods — the church is at the far end and the Crypt entrance is in its yard.",
      ],
      2,
    ),
    "The Crypt Level 1": L(
      "Dark indoor maze; Trial of Ascendancy inside.",
      [
        "Hug one wall — rooms loop back on themselves; the trial and the stairs sit deep, away from the entrance.",
        "Normal-lab checklist stop: don't leave without the trial.",
      ],
      3,
    ),
    "The Crypt Level 2": L(
      "Small burial level with the sealed chest chamber at the bottom.",
      [
        "Dead end — only descend if your route takes the optional chest quest.",
      ],
      2,
    ),
    "The Chamber of Sins Level 1": L(
      "Rectangular temple floor; the stairwell hides along the outer wall.",
      [
        "Run the perimeter until the stairs appear — the middle is a time sink.",
        "Waypoint at the entrance is a useful act anchor.",
      ],
      2,
    ),
    "The Chamber of Sins Level 2": L(
      "Fidelitas' floor; a Trial of Ascendancy shares it.",
      [
        "Sweep for the green-lit trial door while heading to Fidelitas; kill him for the Baleful Gem and portal out.",
      ],
      2,
    ),
    "The Riverways": L(
      "Long river road that forks the act: Western Forest ahead, Wetlands across.",
      [
        "Stay on the road; the waypoint marks the fork.",
        "Western Forest side handles Alira/Weaver business; Wetlands continues the main quest.",
      ],
      2,
    ),
    "The Western Forest": L(
      "Road zone — everything hangs off the road.",
      [
        "Alira's camp is off one side of the road, the Weaver's cave off the other; don't leave the road otherwise.",
        "Blackguard ambushes cluster at the road's pinch points.",
      ],
      2,
    ),
    "The Weaver's Chambers": L(
      "Spider tunnels down to the Weaver.",
      [
        "Mostly a single descending path — kill the Weaver, take Maligaro's Spike, portal.",
        "Know your 'Sharp and Cruel' support gem pick before the turn-in.",
      ],
      2,
    ),
    "The Wetlands": L(
      "Swamp basin; Oak's camp is the central island.",
      [
        "The waypoint sits by Oak — handle your bandit choice in passing.",
        "The Vaal Ruins entrance is on the far side of the swamp from where you entered.",
      ],
      2,
    ),
    "The Vaal Ruins": L(
      "Buried corridors; the Ancient Seal blocks the midpoint.",
      [
        "Smash the seal and keep moving — it's a winding corridor, not a maze.",
        "Follow the wall torches; the dark hides ledge drops.",
      ],
      2,
    ),
    "The Northern Forest": L(
      "Cliffside forest rising toward the Caverns.",
      [
        "Climb — the Caverns entrance is uphill along the cliff wall.",
        "Dread Thicket branches mid-zone; it's optional in this act.",
      ],
      3,
    ),
    "The Dread Thicket": L(
      "Fern maze — optional in Act 2.",
      [
        "Skip on speed runs. If you must: wall-hug; it's a ring with pockets.",
      ],
      3,
    ),
    "The Caverns": L(
      "Twisting crystal cave to the Ancient Pyramid.",
      [
        "Prefer the descending tunnel at forks; the Pyramid door is the deepest point.",
        "Tag the mid-cave waypoint before committing to the boss push.",
      ],
      3,
    ),
    "The Ancient Pyramid": L(
      "Stacked floors up to the Vaal Oversoul on the roof.",
      [
        "Stairs chain corner to corner — sweep each floor's edge for the next flight.",
        "The Act 3 exit is past the boss; no backtracking needed.",
      ],
      2,
    ),
  },
  3: {
    "The City of Sarn": L(
      "Bridge entry into the ruined city; the town gate is across the district.",
      [
        "Follow the main avenue — Clarissa's event and the gate are at the far side.",
        "Don't clear the city; packs thin as you near the gate.",
      ],
      2,
    ),
    "The Slums": L(
      "Streets linking town to the Crematorium, with the sewer grate mid-district.",
      [
        "The Crematorium sits at the far corner — cut the diagonal through courtyards.",
        "Note the sewer entrance as you pass; you come back with the keys.",
      ],
      2,
    ),
    "The Crematorium": L(
      "Industrial interior; Trial of Ascendancy plus the Tolman story room.",
      [
        "Take the trial while sweeping — it's on the Normal lab checklist.",
        "Portal out after the Piety scene instead of walking back.",
      ],
      3,
    ),
    "The Sewers": L(
      "Three-armed sewer network between the Slums and the Marketplace.",
      [
        "Follow the waterway — the far ladder surfaces at the Marketplace.",
        "Victario's three platinum busts sit one per arm; grab them only if your route wants that turn-in.",
      ],
      2,
    ),
    "The Marketplace": L(
      "Market blocks and courtyards; two onward exits.",
      [
        "The Battlefront exit is on the far street edge; the Catacombs (trial) hide in a courtyard.",
        "Navigate by street intersections — the stall interiors all look alike.",
      ],
      3,
    ),
    "The Catacombs": L(
      "Compact crypt holding a Trial of Ascendancy.",
      [
        "Wall-hug to the trial and leave — there's nothing else down here.",
      ],
      2,
    ),
    "The Battlefront": L(
      "Open siege field; Docks at the waterline, Solaris gate across the field.",
      [
        "Tag the waypoint on the main road — two quest runs fan out from here.",
        "The Docks entrance is the pier at the water's edge; Solaris Temple is the monumental gate opposite.",
      ],
      2,
    ),
    "The Solaris Temple Level 1": L(
      "Bright marble halls with generous corridors.",
      [
        "Near-linear — take the grand staircases and keep moving.",
      ],
      1,
    ),
    "The Solaris Temple Level 2": L(
      "Second Solaris floor; Dialla at the top.",
      [
        "Same drill as Level 1 — staircase to staircase; portal out after the quest hand-off.",
      ],
      1,
    ),
    "The Docks": L(
      "Night-time timber maze on the water; the Sulphite pickup.",
      [
        "Head to the far pier line first, then sweep laterally for the Sulphite warehouse.",
        "Accept that this is one of the campaign's worst layouts — bank the pickup and portal straight out.",
      ],
      3,
    ),
    "The Ebony Barracks": L(
      "Military yard; Gravicius mid-camp, Lunaris gate up the stairs.",
      [
        "Cut straight through the parade ground — Gravicius stands in the open.",
        "Tag the waypoint by the Lunaris steps before the Piety push.",
      ],
      2,
    ),
    "The Lunaris Temple Level 1": L(
      "Dark mirror of Solaris; a corridor spine with side labs.",
      [
        "Stay on the main-hall spine; ignore the side laboratories.",
      ],
      2,
    ),
    "The Lunaris Temple Level 2": L(
      "Piety's floor.",
      [
        "Spine to the far end, kill Piety, portal — the walk back is pure waste.",
      ],
      2,
    ),
    "The Imperial Gardens": L(
      "Formal gardens with a hedge maze; trial plus the Library branch.",
      [
        "Navigate by the Sceptre of God — the tower gate is visible from almost anywhere.",
        "The Trial of Ascendancy sits by the hedge maze; take it in passing (last of the Normal six for many routes).",
        "The Library detour is only for unlocking Siosa's gem shop.",
      ],
      2,
    ),
    "The Library": L(
      "Grand hall — Siosa's quest hub with the Archives below.",
      [
        "Talk to Siosa, then only descend for the Golden Pages if your route wants the gem vendor.",
      ],
      2,
    ),
    "The Archives": L(
      "Book-stack maze holding the four Golden Pages.",
      [
        "Pages sit in separate wings — wall-follow and watch for the glowing pickups.",
        "Pure side content; budget it consciously or skip.",
      ],
      3,
    ),
    "The Sceptre of God": L(
      "Tower ascent; stairwells chain upward.",
      [
        "Per floor: find the next stair, ignore the wings — no waypoint mid-tower, so commit.",
      ],
      2,
    ),
    "The Upper Sceptre of God": L(
      "Final floors to Dominus' rooftop.",
      [
        "Linear once the stair chain starts; Dominus has two phases — bank a portal before engaging if unsure.",
        "The Act 4 exit is on the rooftop past the fight.",
      ],
      2,
    ),
  },
  4: {
    "The Aqueduct": L(
      "Straight water channel to Highgate.",
      [
        "It's a corridor — run it; nothing here is worth stopping for.",
      ],
      1,
    ),
    "The Dried Lake": L(
      "Big cracked bowl; Voll near the middle; dead-end zone.",
      [
        "Sweep a shallow arc — Voll's arena mound stands above the flats and reads from a distance.",
        "Kill Voll, then portal/waypoint back; the story continues from Highgate.",
      ],
      2,
    ),
    "The Mines Level 1": L(
      "Rail tunnels; the tracks are the route.",
      [
        "Follow the rails to the Level 2 shaft; treat side galleries as dead ends.",
      ],
      2,
    ),
    "The Mines Level 2": L(
      "Deeper galleries; Deshret's spirit breaks the way onward.",
      [
        "Find the banner/spirit chamber on the main line, trigger it, and keep descending to the Crystal Veins.",
        "At junctions prefer the tunnel that goes down.",
      ],
      2,
    ),
    "The Crystal Veins": L(
      "Small hub cave: waypoint, Dialla, and both Dream portals.",
      [
        "Tag the waypoint immediately.",
        "Kaom's and Daresso's sides can be run in either order — pick by what your build handles better (lava ledges vs arena packs).",
      ],
      1,
    ),
    "Kaom's Dream": L(
      "Lava ledges spiraling downward.",
      [
        "Follow the descending ledge line; misjudged drops cost more time than monsters.",
        "The Stronghold door waits at the bottom.",
      ],
      2,
    ),
    "Kaom's Stronghold": L(
      "Kaom's fortress arena — one of the two organ bosses.",
      [
        "Push straight to the throne arena; take the organ and portal back to the Veins.",
      ],
      2,
    ),
    "Daresso's Dream": L(
      "Sword-strewn dreamscape of bridges toward the Grand Arena.",
      [
        "Bridges chain forward — ignore the side stands.",
        "Density spikes at chokepoints; don't fight in the narrows on hardcore.",
      ],
      2,
    ),
    "The Grand Arena": L(
      "Colosseum pit chain ending at Daresso — the other organ.",
      [
        "Arena gates open in sequence; kill Daresso, grab the organ, portal out.",
      ],
      2,
    ),
    "The Belly of the Beast Level 1": L(
      "Flesh tunnels — organic corridors that all look alike.",
      [
        "Prefer the widest artery at forks; the way down sits in the deepest chamber.",
      ],
      2,
    ),
    "The Belly of the Beast Level 2": L(
      "Gut corridors to the Harvest.",
      [
        "Keep descending — the Harvest opens past the story scene at the bottom.",
      ],
      2,
    ),
    "The Harvest": L(
      "Malachai's organ garden — hub with waypoint and the Black Core.",
      [
        "Tag the waypoint before anything else.",
        "Malachai is two phases and mobile — bank a portal, clear the arena edges first.",
      ],
      2,
    ),
    "The Ascent": L(
      "Bridge climb out of the mountain toward Act 5's ship.",
      [
        "Pure corridor — just run through the scripted scenery.",
      ],
      1,
    ),
  },
  5: {
    "The Slave Pens": L(
      "Slaver interior into Oriath; Overseer Krow at the exit yard.",
      [
        "Room chain — keep pushing forward; Krow's yard opens to town.",
      ],
      2,
    ),
    "The Control Blocks": L(
      "Prison block grid; the Miasmeter sits on the main path.",
      [
        "Sweep block to block toward the far gate; the story pickups are on the way, not hidden.",
      ],
      2,
    ),
    "Oriath Square": L(
      "Large plaza district before the Templar complex.",
      [
        "Cross on the diagonal; the Templar Courts entrance is the cathedral facade.",
        "Tag the waypoint — Act 5 loops back through this area's burned versions later.",
      ],
      2,
    ),
    "The Templar Courts": L(
      "Church interior to the Chamber of Innocence.",
      [
        "Stick to the main aisle — side chapels are dead weight.",
      ],
      2,
    ),
    "The Chamber of Innocence": L(
      "Boss floor — Innocence's sanctum.",
      [
        "Fight in the sanctum, then tag the waypoint here: the act revisits this complex after the fall.",
      ],
      1,
    ),
    "The Torched Courts": L(
      "The Templar Courts burning — same bones, reversed traversal.",
      [
        "Run the aisle logic in reverse; fire-side packs hit harder, so keep moving.",
      ],
      2,
    ),
    "The Ruined Square": L(
      "Oriath's plaza after the fall — the act's hub.",
      [
        "Waypoint central; the Reliquary and Ossuary branch off as side vaults, the Cathedral Rooftop continues the story.",
        "Kitava's Torments roam — fight only what stands on your line.",
      ],
      2,
    ),
    "The Reliquary": L(
      "Vault wings around a central rotunda; story pickup inside.",
      [
        "In-and-out side zone: grab the objective, portal back to the Square.",
      ],
      2,
    ),
    "The Ossuary": L(
      "Bone crypt off the Square — optional in this act.",
      [
        "Side vault with a quest objective; wall-hug in, portal out. (Its Trial of Ascendancy only exists in the Act 10 version.)",
      ],
      2,
    ),
    "The Cathedral Rooftop": L(
      "Rooftop approach to the first Kitava fight.",
      [
        "Linear path; the encounter is scripted set-pieces — dodge the slams, burn the phases.",
        "Nothing to backtrack; Act 6 sails right after.",
      ],
      1,
    ),
  },
  6: {
    "The Twilight Strand": L(
      "The Strand again — hostile the whole way into the Watch.",
      [
        "Same straight beach as Act 1 with higher density; hold the line into town.",
      ],
      1,
    ),
    "The Coast": L(
      "Coast rerun at cruel difficulty.",
      [
        "Act 1 rule holds: cliff edge to the far-end exit, waypoint mid-strip.",
        "Tidal Island is optional again — check your route before detouring.",
      ],
      2,
    ),
    "The Tidal Island": L(
      "Island loop rerun — optional side kill.",
      [
        "Same loop as Act 1; only come for the quest target on the far tip, then portal.",
      ],
      2,
    ),
    "The Mud Flats": L(
      "Flats rerun — no glyphs this time, just cross.",
      [
        "Head for the far edge: the Ridge continues the act; the Karui Fortress is the offshore side zone.",
        "Density is the danger — keep moving through the Rhoa fields.",
      ],
      2,
    ),
    "The Karui Fortress": L(
      "Tukohama's island fort — side zone.",
      [
        "Cross to the fort, kill Tukohama for the 'Father of War' turn-in, portal out.",
      ],
      2,
    ),
    "The Ridge": L(
      "Single ridgeline path — Act 6's answer to the Ledge.",
      [
        "One lane along the crest; the Lower Prison gate is at the top end. Just run.",
      ],
      1,
    ),
    "The Lower Prison": L(
      "Prison rerun.",
      [
        "Outer-corridor rule from Act 1 applies; the stairs lead up to Shavronne's Tower.",
      ],
      2,
    ),
    "Shavronne's Tower": L(
      "Tower floors up to Shavronne.",
      [
        "Stair-chain per floor; after the fight the path drops toward Prisoner's Gate.",
      ],
      2,
    ),
    "Prisoner's Gate": L(
      "The canyon road again — now hosting a Trial of Ascendancy (Cruel lab).",
      [
        "Downhill road rule applies; the trial pocket branches mid-road — it's on the Cruel checklist, take it.",
        "The exit at the bottom opens the Riverways.",
      ],
      2,
    ),
    "The Riverways": L(
      "River road rerun.",
      [
        "Stay on the road; the fork waypoint anchors the act — Wetlands is the way on.",
      ],
      2,
    ),
    "The Wetlands": L(
      "Swamp rerun; Ryslatha nests where Oak camped.",
      [
        "The central island holds Ryslatha ('The Puppet Mistress') — kill in passing.",
        "Far-side exit continues toward the Southern Forest.",
      ],
      2,
    ),
    "The Southern Forest": L(
      "Southern Forest in reverse — from the river toward the Beacon.",
      [
        "Follow the road; the Beacon replaces the town-gate end of Act 1's version.",
      ],
      2,
    ),
    "The Beacon": L(
      "Coastal fort with the signal fire — an up-then-down zone.",
      [
        "Climb the switchbacks, light the beacon, then descend to the shore for Brine King's Reef.",
        "Two phases, one route — don't clear the wings.",
      ],
      2,
    ),
    "Brine King's Reef": L(
      "Tidal causeway to the act boss.",
      [
        "The causeway is linear; the Brine King fight is about respecting the wave/geyser tells.",
        "Act 7 departs right after the kill.",
      ],
      2,
    ),
  },
  7: {
    "The Broken Bridge": L(
      "The bridge again — now the act's opening crossing.",
      [
        "One road — cross it; the Crossroads exit is on the far side.",
      ],
      1,
    ),
    "The Crossroads": L(
      "The hub rerun; this act routes you south and uphill.",
      [
        "Same central waypoint; you want the Fellshrine road (Crypt trial) and the Chamber of Sins hill (main quest).",
      ],
      1,
    ),
    "The Fellshrine Ruins": L(
      "Church road rerun.",
      [
        "Road to the ruin; the Crypt below now carries a Trial of Ascendancy.",
      ],
      2,
    ),
    "The Crypt": L(
      "Single-level Crypt holding a Cruel-lab Trial of Ascendancy.",
      [
        "Wall-hug to the trial, then portal — nothing else down here.",
      ],
      2,
    ),
    "The Chamber of Sins Level 1": L(
      "Chamber rerun, Level 1.",
      [
        "Perimeter rule to the stairs; Maligaro's Sanctum branches beneath as side content.",
      ],
      2,
    ),
    "The Chamber of Sins Level 2": L(
      "Level 2 — Maligaro's territory, with another Trial of Ascendancy.",
      [
        "Take the trial while sweeping to the story room — it completes most Cruel-lab checklists together with the Crypt and Prisoner's Gate.",
        "The Ashen Fields open beyond.",
      ],
      2,
    ),
    "Maligaro's Sanctum": L(
      "Maligaro's flesh workshop — side zone.",
      [
        "Push to the boss chamber, settle Maligaro, portal out.",
      ],
      2,
    ),
    "The Ashen Fields": L(
      "Burned farmland between the Chamber hill and the Northern Forest.",
      [
        "Cut across on the cart road; the forest gate is on the far side.",
        "Tag the mid-field waypoint.",
      ],
      2,
    ),
    "The Northern Forest": L(
      "Forest rerun; Greust's camp sits on the main path.",
      [
        "Handle the Greust interaction in passing — it gates later act business.",
        "The Causeway exit is the aqueduct end; the Dread Thicket branches for the fireflies.",
      ],
      2,
    ),
    "The Dread Thicket": L(
      "Fern maze rerun — now holding the seven fireflies.",
      [
        "Fireflies glow through the fog — sweep the ring plus pockets until you have all seven.",
        "One of the act's honest time sinks; deliberate practice here pays real seconds.",
      ],
      3,
    ),
    "The Causeway": L(
      "Aqueduct span — linear, with Kishara's Star on the way.",
      [
        "Run the span; the Star pickup sits on the main line — don't leave the bridge for it.",
        "Vaal City at the far end.",
      ],
      1,
    ),
    "The Vaal City": L(
      "Overgrown city hub before Arakaali's temple.",
      [
        "Tag the central waypoint; make sure the act's pickups are done before the temple descent.",
      ],
      2,
    ),
    "The Temple of Decay Level 1": L(
      "Web-choked corridors downward.",
      [
        "Near-linear — follow the webbing down; don't clear the side pockets.",
      ],
      2,
    ),
    "The Temple of Decay Level 2": L(
      "Arakaali's floor — act finale.",
      [
        "Push to the arena; save movement/defensive flasks for her phase transitions.",
        "The Act 8 exit is past the fight.",
      ],
      2,
    ),
  },
  8: {
    "The Sarn Ramparts": L(
      "City wall approach — a corridor with a view.",
      [
        "Run the wall line to the far tower; the Toxic Conduits drop below.",
      ],
      1,
    ),
    "The Toxic Conduits": L(
      "Sewer junction under Sarn; Doedre's bowl at its heart.",
      [
        "Follow the main sludge line to the Cesspool arena; the city reopens after.",
      ],
      2,
    ),
    "Doedre's Cesspool": L(
      "Doedre's arena bowl.",
      [
        "Boss set-piece — clear the rim first, then fight in the middle; her sigils punish standing still.",
      ],
      2,
    ),
    "The Grand Promenade": L(
      "Elevated boulevard on the Lunaris side of the act.",
      [
        "Straight boulevard; the Bath House sits at the far end.",
        "The High Gardens branch is side content — skip unless routed.",
      ],
      2,
    ),
    "The High Gardens": L(
      "Terraced gardens — optional side zone.",
      [
        "Only enter if your route includes its quest; in, objective, portal.",
      ],
      2,
    ),
    "The Bath House": L(
      "Bathhouse interior holding an Eternal-lab Trial of Ascendancy.",
      [
        "Take the trial — first of the final three.",
        "The exit continues toward the Lunaris Concourse.",
      ],
      2,
    ),
    "The Lunaris Concourse": L(
      "Plaza before Lunaris Temple, with waypoint.",
      [
        "Tag the waypoint; the temple door is the landmark — floors stack above.",
      ],
      2,
    ),
    "The Lunaris Temple Level 1": L(
      "Lunaris rerun, Level 1.",
      [
        "Corridor spine rule — main hall forward, ignore the labs.",
      ],
      2,
    ),
    "The Lunaris Temple Level 2": L(
      "Lunaris rerun, Level 2 — branch objective at the top.",
      [
        "Spine to the top, complete the temple objective, portal down.",
      ],
      2,
    ),
    "The Grain Gate": L(
      "Warehouse gate district opening the Solaris side.",
      [
        "Push through the gate yards toward the Imperial Fields.",
        "Gemling packs cluster at chokepoints — respect them on hardcore.",
      ],
      2,
    ),
    "The Imperial Fields": L(
      "Farm fields before the Solaris Concourse.",
      [
        "Cross on the road; the Concourse gate is far side, and the Quay branches at the water as side content.",
      ],
      2,
    ),
    "The Solaris Concourse": L(
      "Solaris plaza with waypoint.",
      [
        "Tag the waypoint; same temple drill as the Lunaris side.",
      ],
      2,
    ),
    "The Solaris Temple Level 1": L(
      "Solaris rerun, Level 1.",
      [
        "Bright corridor spine — staircases forward.",
      ],
      2,
    ),
    "The Solaris Temple Level 2": L(
      "Solaris rerun, Level 2 — branch objective at the top.",
      [
        "Top floor, objective, portal down — mirror of the Lunaris branch.",
      ],
      2,
    ),
    "The Quay": L(
      "Docks district — optional side zone.",
      [
        "Skip unless your route takes its quest; it's a wandering waterfront otherwise.",
      ],
      2,
    ),
    "The Harbour Bridge": L(
      "Final bridge — Solaris & Lunaris await.",
      [
        "Linear bridge to the arena; the twin fight alternates sun/moon phases — fight from the seam between their zones.",
        "Act 9 sails after.",
      ],
      2,
    ),
  },
  9: {
    "The Blood Aqueduct": L(
      "The Aqueduct, bloodied — still one straight channel.",
      [
        "Run the channel; it's the campaign's most farmed zone, but on a timed run you're just passing through.",
      ],
      1,
    ),
    "The Descent": L(
      "Cliff switchbacks down from Highgate.",
      [
        "One path down; the Vastiri Desert opens at the bottom.",
      ],
      1,
    ),
    "The Vastiri Desert": L(
      "Open desert crossing with the Oasis side basin.",
      [
        "Head for the far rock wall — the Foothills gate breaks the skyline.",
        "The Oasis is a side basin; enter only if your route takes its quest.",
        "Open-desert zones drift the most — pick a bearing early and commit.",
      ],
      3,
    ),
    "The Oasis": L(
      "Palm basin — side zone.",
      [
        "The basin rings the water; in, objective, portal.",
      ],
      2,
    ),
    "The Foothills": L(
      "Rising scrubland hub: Tunnel ahead, Boiling Lake aside, waypoint on the way.",
      [
        "Tag the waypoint; the Tunnel mouth sits high — climb toward it.",
        "The Boiling Lake is side content for its quest pickup.",
      ],
      2,
    ),
    "The Boiling Lake": L(
      "Acid lake loop — side zone with the Basilisk.",
      [
        "The Basilisk guards the pickup at the lake's far side; kill, grab, portal.",
      ],
      2,
    ),
    "The Tunnel": L(
      "Mine tunnel carrying an Eternal-lab Trial of Ascendancy.",
      [
        "The trial is on the way — second of the final three.",
        "The tunnel runs through to the Quarry; don't chase side shafts.",
      ],
      2,
    ),
    "The Quarry": L(
      "Terraced quarry hub with waypoint and the act's story doors.",
      [
        "Tag the waypoint; the Refinery is side content, the Belly descent is the main line.",
        "The hub is compact — follow quest markers rather than clearing terraces.",
      ],
      2,
    ),
    "The Refinery": L(
      "Industrial side pocket.",
      [
        "Single quest objective inside — in, kill, out.",
      ],
      2,
    ),
    "The Belly of the Beast": L(
      "Return to the flesh — single level this time.",
      [
        "Descend the gut corridor; the Rotting Core waits below.",
      ],
      2,
    ),
    "The Rotting Core": L(
      "Malachai's remains — the Depraved Trinity finale.",
      [
        "Three arena pods branch off the core; clear the Trinity pod by pod without overstaying in the degen.",
        "Act 10 follows the flask event — nothing to backtrack.",
      ],
      2,
    ),
  },
  10: {
    "The Cathedral Rooftop": L(
      "Rooftop landing under siege — down into the Square.",
      [
        "Follow the breach line down; the Ravaged Square gate is below.",
        "Density is brutal here — run, don't clear.",
      ],
      2,
    ),
    "The Ravaged Square": L(
      "Oriath's shattered hub — the whole act radiates from here.",
      [
        "Tag the central waypoint first.",
        "Learn the compass: Torched Courts (→ Desecrated Chambers) one way, the Canals (→ Kitava) another, the Ossuary trial off to its own side — wrong doors cost minutes.",
      ],
      2,
    ),
    "The Torched Courts": L(
      "The Courts under fire — route to the Desecrated Chambers.",
      [
        "Aisle rule as ever; the Chambers door is at the far end.",
      ],
      2,
    ),
    "The Desecrated Chambers": L(
      "The sanctum desecrated — Avarius reassembled.",
      [
        "Boss room at depth; after the kill, portal back to the Square rather than walking.",
      ],
      2,
    ),
    "The Ossuary": L(
      "Bone crypt — the final Trial of Ascendancy.",
      [
        "Side trip for the last Eternal trial; wall-hug in, trial, portal out.",
      ],
      2,
    ),
    "The Canals": L(
      "Waterway toward Kitava's harbor, waypoint mid-route.",
      [
        "Follow the water; tag the mid-zone waypoint — it's your boss-retry insurance.",
      ],
      2,
    ),
    "The Feeding Trough": L(
      "Short, nasty run-up to Kitava round two.",
      [
        "Bank a portal before the arena; this Kitava hits like an act boss should.",
        "The kill ends the campaign — Innocence ferries you to Karui Shores.",
      ],
      2,
    ),
  },
};

// ---- join against areas.json & validate both directions -------------------
const here = dirname(fileURLToPath(import.meta.url));
const areasPath = join(here, "..", "crates", "core", "data", GAME, AREAS_PATCH, "areas.json");
const { areas } = JSON.parse(readFileSync(areasPath, "utf8"));

const campaign = areas.filter((a) => a.kind === "campaign");
const errors = [];
const zones = [];

for (const a of campaign) {
  const note = NOTES[a.act]?.[a.name];
  if (!note) {
    errors.push(`missing layout notes: act ${a.act} — ${a.name} (${a.id})`);
    continue;
  }
  zones.push({
    areaId: a.id,
    name: a.name,
    act: a.act,
    order: a.order,
    side: a.side,
    waypoint: a.waypoint,
    ...note,
  });
}
for (const [act, byName] of Object.entries(NOTES)) {
  for (const name of Object.keys(byName)) {
    if (!campaign.some((a) => a.act === Number(act) && a.name === name)) {
      errors.push(`layout notes with no matching area: act ${act} — ${name}`);
    }
  }
}
for (const z of zones) {
  if (!z.summary || z.tips.length === 0) errors.push(`empty notes: ${z.areaId}`);
  if (![1, 2, 3].includes(z.consistency)) errors.push(`bad consistency: ${z.areaId}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

zones.sort((a, b) => a.act - b.act || a.order - b.order);
const out = join(here, "..", "crates", "core", "data", GAME, "layouts.json");
writeFileSync(
  out,
  JSON.stringify({ game: GAME, writtenFor: AREAS_PATCH, source: SOURCE, zones }, null, 1) + "\n",
);
console.log(`wrote ${out}: ${zones.length} zone layouts (of ${campaign.length} campaign zones)`);
