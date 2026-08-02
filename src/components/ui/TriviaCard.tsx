import { useState } from 'react';
import { Lightbulb, Check, X, RotateCw } from 'lucide-react';

interface TriviaQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  funFact: string;
}

// Deep-cut history, records, and famous moments — deliberately not rules or
// definitions (downs, point values, acronyms), which are trivially looked up
// and don't reward actually knowing the sport. Every fact here is a stable,
// well-documented historical event, not a stat that could drift or a claim
// under real dispute, since this renders as flat assertion with no citation.
const TRIVIA_BANK: TriviaQuestion[] = [
  {
    question: 'Who is the only player to win the Heisman Trophy twice?',
    choices: ['Herschel Walker', 'Archie Griffin', 'Tim Tebow', 'Marcus Allen'],
    correctIndex: 1,
    funFact: 'Archie Griffin won as a junior in 1974 and repeated as a senior in 1975 for Ohio State — nobody else has done it since.',
  },
  {
    question: 'Which team holds the longest winning streak in major college football history, at 47 straight games from 1953–1957?',
    choices: ['Alabama', 'Oklahoma', 'USC', 'Nebraska'],
    correctIndex: 1,
    funFact: "The streak, under coach Bud Wilkinson, finally ended in a loss to Notre Dame.",
  },
  {
    question: 'Which two schools played in the first college football game ever, in 1869?',
    choices: ['Harvard and Yale', 'Rutgers and Princeton', 'Army and Navy', 'Michigan and Ohio State'],
    correctIndex: 1,
    funFact: 'Rutgers beat Princeton 6–4 under rules closer to soccer than modern football.',
  },
  {
    question: "Whose 2,628 rushing yards in a single season (1988) is still the FBS record?",
    choices: ['Barry Sanders', 'Herschel Walker', 'Ricky Williams', 'Emmitt Smith'],
    correctIndex: 0,
    funFact: 'Sanders, of Oklahoma State, also won the Heisman that same season.',
  },
  {
    question: "Sportswriter Grantland Rice gave what nickname to Notre Dame's legendary 1924 backfield?",
    choices: ['The Four Horsemen', 'The Fighting Four', 'The Irish Cavalry', 'The Golden Backfield'],
    correctIndex: 0,
    funFact: "Rice's lede compared them to the biblical Four Horsemen of the Apocalypse — one of the most famous openings in sportswriting history.",
  },
  {
    question: "Which bowl game, first played in 1902, calls itself \"The Granddaddy of Them All\"?",
    choices: ['The Sugar Bowl', 'The Orange Bowl', 'The Rose Bowl', 'The Cotton Bowl'],
    correctIndex: 2,
    funFact: "Michigan beat Stanford 49–0 in that first Rose Bowl — so lopsided it wasn't played again annually until 1916.",
  },
  {
    question: "In Cal's famous 1982 kickoff-return win over Stanford — simply called \"The Play\" — how many laterals did they use?",
    choices: ['3', '4', '5', '6'],
    correctIndex: 2,
    funFact: "The return ended with Cal's Kevin Moen running through the Stanford band, which had already taken the field.",
  },
  {
    question: 'Which coach held the record for most career wins in college football history at the time of his death in 1983?',
    choices: ['Nick Saban', 'Bear Bryant', 'Eddie Robinson', 'Woody Hayes'],
    correctIndex: 1,
    funFact: 'Bryant finished with 323 career wins across Maryland, Kentucky, Texas A&M, and Alabama.',
  },
  {
    question: "What's the name of Auburn's 2013 game-winning return of a missed field goal against Alabama?",
    choices: ['The Kick Six', 'The Miracle at Jordan-Hare', 'The Return', 'The Long Six'],
    correctIndex: 0,
    funFact: "Chris Davis returned the missed 57-yard field goal 109 yards for a touchdown as time expired.",
  },
  {
    question: 'Legendary Notre Dame coach Knute Rockne died in 1931 in what kind of accident?',
    choices: ['A car crash', 'A plane crash', 'A boating accident', 'A train derailment'],
    correctIndex: 1,
    funFact: "Rockne's death shocked the nation — he remains one of the winningest coaches by career winning percentage in the sport's history.",
  },
  {
    question: 'Which team won the first-ever Bowl Championship Series National Championship, played in January 1999?',
    choices: ['Florida State', 'Tennessee', 'Nebraska', 'Ohio State'],
    correctIndex: 1,
    funFact: 'Tennessee beat Florida State 23–16 and finished that season 13–0.',
  },
  {
    question: 'A 1906 rule change legalized what, fundamentally opening up the modern passing game?',
    choices: ['The forward pass', 'Substitutions mid-drive', 'The two-point conversion', 'Instant replay review'],
    correctIndex: 0,
    funFact: "The forward pass was legalized partly in response to the sport's brutality — President Theodore Roosevelt had pushed for reforms after a spate of deaths in 1905.",
  },
  {
    question: 'Which player is remembered for famously running the wrong way with a fumble recovery in the 1929 Rose Bowl?',
    choices: ['Roy Riegels', 'Red Grange', 'Jim Thorpe', 'Bronko Nagurski'],
    correctIndex: 0,
    funFact: "Riegels, of California, ran 69 yards toward his own end zone before a teammate tackled him — the play helped cost Cal the game.",
  },
  {
    question: 'In what year did Army and Navy first play their rivalry game?',
    choices: ['1869', '1890', '1912', '1925'],
    correctIndex: 1,
    funFact: 'Navy won that first meeting — the game is now played every December and is known simply as "America\'s Game."',
  },
  {
    question: 'Who won the first-ever Heisman Trophy in 1935?',
    choices: ['Jay Berwanger', 'Davey O\'Brien', 'Clint Frank', 'Nile Kinnick'],
    correctIndex: 0,
    funFact: 'Berwanger played for the University of Chicago — the award was renamed the Heisman a year later, after athletic director John Heisman died.',
  },
];

function pickIndex(exclude: Set<number>): number {
  const pool = TRIVIA_BANK.map((_, i) => i).filter(i => !exclude.has(i));
  const source = pool.length > 0 ? pool : TRIVIA_BANK.map((_, i) => i);
  return source[Math.floor(Math.random() * source.length)];
}

// Drop-in filler for "nothing here yet" states (pre-draft, empty roster) —
// gives people something to actually do while they wait instead of staring
// at a static message.
export function TriviaCard({ className = '' }: { className?: string }) {
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [index, setIndex] = useState(() => pickIndex(new Set()));
  const [selected, setSelected] = useState<number | null>(null);

  const q = TRIVIA_BANK[index];
  const answered = selected !== null;
  const correct = selected === q.correctIndex;

  const handleNext = () => {
    const nextSeen = new Set(seen).add(index);
    const next = pickIndex(nextSeen);
    setSeen(nextSeen.size >= TRIVIA_BANK.length ? new Set() : nextSeen);
    setIndex(next);
    setSelected(null);
  };

  return (
    <div className={`card-inner p-4 text-left max-w-md mx-auto space-y-3 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-turf-500 uppercase tracking-wide font-medium">
        <Lightbulb className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
        While you wait — CFB trivia
      </div>
      <p className="text-sm text-white font-medium">{q.question}</p>
      <div className="space-y-1.5">
        {q.choices.map((choice, i) => {
          const isCorrectChoice = i === q.correctIndex;
          const isSelected = i === selected;
          let style = 'border-turf-700 text-turf-300 hover:border-turf-600 hover:bg-turf-800/40';
          if (answered && isCorrectChoice) style = 'border-field-600 bg-field-950/40 text-field-300';
          else if (answered && isSelected) style = 'border-red-800 bg-red-950/30 text-red-300';
          else if (answered) style = 'border-turf-800 text-turf-500';

          return (
            <button
              key={choice}
              onClick={() => !answered && setSelected(i)}
              disabled={answered}
              className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm border transition-colors ${style} ${answered ? 'cursor-default' : ''}`}
            >
              {answered && isCorrectChoice && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              {answered && isSelected && !isCorrectChoice && <X className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="flex-1">{choice}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div className="pt-1 space-y-2 animate-content-fade-in">
          <p className={`text-xs font-medium ${correct ? 'text-field-400' : 'text-red-300'}`}>
            {correct ? 'Nailed it.' : `Not quite — it's "${q.choices[q.correctIndex]}."`}
          </p>
          <p className="text-xs text-turf-500">{q.funFact}</p>
          <button onClick={handleNext} className="btn-secondary btn-sm mt-1">
            <RotateCw className="w-3.5 h-3.5" /> Another one
          </button>
        </div>
      )}
    </div>
  );
}
