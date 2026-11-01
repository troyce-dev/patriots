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
- Each correct team (the starting team rotates each question) picks **Pass** (boom or bust, about +8.5 yds on average),
  **Run** (steady, about +5.5) or **Defense** (choose another team and push them back about 5.6 yds;
  pushing a team into its own end zone is a safety and sends it back to the 5).
- Keys: Space/Enter = main button, P/R/D = play call, Ctrl+Z = undo.
- **Undo** takes back the last play. Click a helmet to move it by hand.
- The game saves in the browser, so a refresh or going to Setup and back keeps your place.

```sh
node tests/football.test.js   # question math + play engine tests
```
