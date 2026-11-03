# Stats Football

A projector game for the Monday after a Patriots game. Up to five teams answer
statistics questions built from that week's box score. Every team that gets
the question right calls a play: **Pass**, **Run** or **Defense**. The result is
random, and each team's helmet moves down its own lane of the field, like the carnival
water-gun horse race. The first team to reach the end zone wins.

**Play it:** https://troyce-dev.github.io/patriots/ (after GitHub Pages is turned on: Settings → Pages →
Deploy from a branch → `main`, `/ (root)`). It also works straight from the files: download the ZIP and double-click `index.html`.

## Each week

1. **This week's game**: get the box score in without typing. Use one of these:
   - **⚡ Get the latest game from ESPN**: one click fills in the last finished Patriots game,
     including earlier scores this season. This needs a network that doesn't block ESPN.
   - **Drag & drop**: on ESPN, NFL.com or Pro-Football-Reference, open the game's Box Score / Team Stats page,
     highlight the stats tables and drag them onto the dashed box. Or copy (Ctrl+C), click the box and paste (Ctrl+V).
     A saved web page (.html) or text file can be dropped too. Drop a second page and the numbers are combined.
     Boxes that were filled are outlined green, and Patriots boxes that are still empty are outlined yellow.
     If the two teams come out backwards, press **Swap teams**. **Undo import** puts the old numbers back.

   You can also type or fix numbers by hand: score by quarter, passing, rushing, 3rd downs, score by quarter, passing, rushing, 3rd downs,
   penalties, time of possession, drives, field goals, up to six receivers, the team's earlier
   scores this season, and the kicker's FG% (the one number you always type, and it is remembered). Blank boxes are fine; questions that need them are skipped.
   (Sample made-up numbers are loaded the first time so you can try it.)
2. **Questions**: about 20 questions are generated automatically at three levels:
   - ★ warm-up: completion %, yards per carry, time-of-possession %, combined mean
   - ★★ standard: percentage points vs percent, conditional probability, yards per play,
     percent change, points per drive, binomial (independent field goals)
   - ★★★ challenge: NFL passer rating formula, sample standard deviation, z-score vs the season,
     95% confidence interval for a proportion, correlation r and least-squares regression prediction,
     binomial P(X = 2 of 3), population σ of quarter scores

   Each comes with the answer and worked solution. Untick any you don't want, add your own
   (`Question || Answer`, one per line), and **Print answer key**.
3. **Teams & rules**: team names and helmet colors, where teams start (midfield / own 35 / own 20)
   and an optional answer timer.

## Running the game

- Show the question → **Reveal answer** → click (or press 1–5) the teams that got it right → **Call the plays**.
- Each correct team (the starting team rotates each question) picks **Pass** (boom or bust, about +7.7 yds on average),
  **Run** (steady, never loses yards, about +6.0) or **Defense** (choose another team and push them back about 5.7 yds;
  pushing a team into its own end zone is a safety and sends it back to the 5).
- Keys: Space/Enter = main button, P/R/D = play call, Ctrl+Z = undo.
- **Undo** takes back the last play. Click a helmet to move it by hand.
- The game saves in the browser, so a refresh or going to Setup and back keeps your place.

## Teams

Each of the 5 teams is an NFL team: pick it from the **NFL team** list on **Setup → Teams & rules**. The helmet takes that
team's colors and abbreviation (no logos), and the name fills in (you can still edit it). Choose **Custom team** to pick your own
name and colors. The defaults are the Bills, Dolphins, Jets, Chiefs and Eagles.

## Team devices (each team logs in on its own Chromebook/phone)

On **Setup → Teams & rules → Team devices**, choose one of these:

- **Projector only**: the original game. Teams answer on paper and you click who got it right.
- **Each team on its own device**: uses the `patriots-stats` Firebase project, which is already built into the site (setup steps are below in case it ever needs redoing).
  Send every team the same **join link** (Copy join link, then post it in Google Classroom), or have them open
  `https://troyce-dev.github.io/patriots/team.html` and type the room code. Teams are given out in join order: the first device
  is Team 1, the next is Team 2, and so on. A device that refreshes keeps its team. Use **Free this team** to hand a team
  to a different device, or **Reset teams** to have everyone join again.
- **Practice on this computer**: no setup. Open the join link in a few other tabs of the same browser to try it out.

During the game:

1. Teams see the question on their device and type an answer. The projector shows which teams have answered (not the answers).
2. Click **Time's up — check answers**. Each answer is checked automatically against the answer key; rounding
   in the last digit is allowed, and 0.686 counts for 68.6%. Every team's answer shows on the projector with ✔/✘.
   Click a team to change its mark (custom questions without a number in the answer are yours to judge).
3. Click **Call the plays**. Teams that got it right pick **Pass / Run / Defense** (and a target for Defense)
   on their own device. When it's their turn the play runs on the projector by itself. You can still pick for a team
   that isn't connected. **Undo** lets that team pick again.

### Self-paced games (each team at its own speed)

On **Setup → Teams & rules → Rules**, set **Game style** to **Self-paced** (team devices must be on).

- Each team gets its own stream of questions on its device. Warm-ups come first, but every team gets a different order,
  so teams can't copy each other.
- A correct answer gives the team a play right away (Pass / Run / Defense). A wrong answer is a sack: −5 yards.
  The faster a team answers correctly, the more plays it gets. The first touchdown wins.
- The projector shows the field moving live, a table of each team's progress (question, ✔, ✘, plays), and a feed of every
  answer with the answer key. Click **Mark right** or **Mark wrong** on a team's latest answer to change it; Mark right gives the 5 yards back
  plus a play. Answers the game can't check (your own questions with no number) wait for you to click ✔ or ✘.

**Wrong answer = sack** (on by default) works in both styles. In the Together style, every team not marked ✔ loses 5 yards when you
click **Call the plays** (Undo takes it back). A sack never goes past a team's own 1-yard line.

The firewall must allow `gstatic.com` and `firebaseio.com` (Google services) on student devices.

### Firebase setup (once)

1. <https://console.firebase.google.com>: **Create a project** (Analytics off).
2. **Databases & Storage → Realtime Database → Create database** (United States, *locked mode*). On the **Rules** tab, paste:
   ```json
   { "rules": { "rooms": { "$room": { ".read": "auth != null", ".write": "auth != null" } } } }
   ```
   and click **Publish**.
3. **Security → Authentication → Get started → Sign-in method → Anonymous → Enable**.
4. **Project Overview → + Add app → </> (Web) → Register app**. Copy the `firebaseConfig` block into `js/firebase-config.js`
   (this site already has the `patriots-stats` project there) or paste it into the box on Setup → Teams & rules.

```sh
node tests/football.test.js   # question math + play engine tests
```
