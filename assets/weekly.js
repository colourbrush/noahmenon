// Saturday auto-drops. Merged on top of the Google Sheet content.
// quiz: [deckId, question, correctAnswer, [wrong answers], explanation]
// Saturday drop 2026-11-28
export const WEEKLY = {
  quiz: [
    ["econ", "The price of a replica soccer shirt rises by 10% and quantity demanded falls by 5%. What is the price elasticity of demand?", "−0.5 (price inelastic)", ["−2 (price elastic)", "−5 (price elastic)", "+0.5 (a Giffen good)"], "PED = %ΔQd ÷ %ΔP = −5 ÷ 10 = −0.5. Because |PED| < 1, demand is inelastic and the club's revenue from shirts rises."],
    ["econ", "Which pair of characteristics defines a public good, such as a lighthouse or street lighting?", "Non-excludable and non-rivalrous", ["Excludable and rivalrous", "Rivalrous but non-excludable", "Only ever provided by private firms"], "Nobody can be stopped from using it and one person's use doesn't reduce anyone else's, so free riders mean the market under-provides it."],
    ["psych", "In Milgram's 1963 obedience study, roughly what percentage of participants went all the way to the maximum 450-volt shock?", "65%", ["0%", "5%", "100%"], "26 of 40 participants (65%) obeyed to the end, far more than psychiatrists had predicted beforehand."],
    ["psych", "Which research method allows a psychologist to establish cause and effect?", "An experiment that manipulates an independent variable", ["A correlational study", "A case study of one person", "An unstructured interview"], "Only by changing the IV while controlling other variables can you conclude that the IV caused the change in the DV."],
    ["bio", "A basketball player's heart rate rises during a fast break. Which part of the brain controls heart rate?", "The medulla oblongata", ["The cerebellum", "The hippocampus", "The occipital lobe"], "The cardiovascular centre in the medulla speeds the heart up via sympathetic nerves and slows it via the vagus nerve."],
    ["bio", "What does the sodium-potassium pump do in a resting neuron?", "Uses ATP to pump 3 Na⁺ out and 2 K⁺ in", ["Lets 3 K⁺ out and 2 Na⁺ in without ATP", "Releases neurotransmitter into the synapse", "Moves glucose into the axon"], "This active transport helps keep the resting potential at about −70 mV, with the inside negative."],
    ["sport", "In basketball, a player is fouled while making a three-point shot. What is the maximum number of points they can score on that play?", "4", ["3", "5", "6"], "The made three counts, and they get one free throw: the famous 'four-point play'."],
    ["sport", "If a soccer World Cup knockout match is level after 90 minutes, how much extra time is played before penalties?", "Two halves of 15 minutes", ["Two halves of 45 minutes", "One 10-minute golden-goal period", "None, it goes straight to penalties"], "30 minutes of extra time, then a penalty shootout if it's still level. Golden goals were scrapped in 2004."],
    ["f1", "Which flag tells an F1 driver that a faster car is about to lap them and they must let it pass?", "The blue flag", ["The chequered flag", "The red flag", "The black flag"], "Ignoring blue flags earns a penalty. Red stops the session and black disqualifies a driver."],
    ["f1", "Modern F1 hybrid power units are built around which type of combustion engine?", "A 1.6-litre turbocharged V6", ["A 3.0-litre V10", "A 2.4-litre V8", "A 4.0-litre V12"], "F1 switched from 2.4-litre V8s to 1.6-litre turbo V6 hybrids in 2014, and the V6 has stayed since."],
    ["chess", "With best defence, what can a king and two knights achieve against a lone king?", "They cannot force checkmate", ["They mate in under 10 moves", "They always win", "They mate only if the bare king starts in a corner"], "Mate positions exist, but the defender can always avoid them. Two knights only win if the opponent blunders."],
    ["chess", "Under FIDE rules, a player's clock runs out, but their opponent has only a lone king. What is the result?", "A draw", ["The opponent wins", "The game is replayed", "Both players lose"], "If the opponent has no possible way to checkmate by any series of legal moves, running out of time is a draw."]
  ],
  puzzles: [
    { name: "Smothered Sacrifice", fen: "r6k/6pp/7N/8/2Q5/8/6PP/6K1 w - - 0 1", n: 2, hint: "Make the rook block its own king's last escape square." },
    { name: "Criss-Cross Bishops", fen: "2kr4/p2p1ppp/8/8/5B2/3B4/5PPP/6K1 w - - 0 1", n: 1, hint: "One bishop already guards b8 and c7. Send the other to the long edge." }
  ],
  links: [
    [ ["Soccer ___ kick", ["FREE", "GOAL", "CORNER", "PENALTY"]],
      ["Types of unemployment", ["STRUCTURAL", "CYCLICAL", "FRICTIONAL", "SEASONAL"]],
      ["F1 tyre compounds", ["SOFT", "MEDIUM", "HARD", "INTER"]],
      ["Chess tactics", ["FORK", "PIN", "SKEWER", "DEFLECTION"]] ]
  ],
  oracle: [
    "Retrieval practice beats re-reading: close the book and write down everything you remember, then check. The effort of recalling is what makes the memory stick.",
    "Before every chess move, scan checks, captures and threats for both sides. Most blunders happen because you didn't ask what your opponent's best reply is.",
    "The Oracle runs a 70-billion-parameter language model. It writes one token at a time: the text so far becomes vectors, passes through layers of matrix multiplications, and comes out as a probability for every possible next token. It never looks facts up, so a fluent answer can still be wrong. Check it."
  ]
};
