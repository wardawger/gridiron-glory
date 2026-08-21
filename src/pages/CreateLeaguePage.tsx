import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trophy, Users, ChevronRight } from 'lucide-react';
import { Toggle } from '../components/ui/Toggle';

interface Props {
  displayName: string;
  onCreate: (
    name: string,
    maxTeams: number,
    playerCount: number,
    bench?: { enabled: boolean; startersCount: number; benchCount: number },
  ) => Promise<{ error?: string }>;
  hasExistingLeague?: boolean;
}

export function CreateLeaguePage({ displayName, onCreate, hasExistingLeague }: Props) {
  const navigate = useNavigate();
  const [name, setName]         = useState('');
  const [maxTeams, setMaxTeams] = useState(10);
  const [players, setPlayers]   = useState(4);
  const [benchEnabled, setBenchEnabled]   = useState(false);
  const [startersCount, setStartersCount] = useState(10);
  const [benchCount, setBenchCount]       = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (benchEnabled && startersCount + benchCount !== maxTeams) {
      setError(`Starters + Bench must total ${maxTeams} (Teams per Player)`);
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await onCreate(name.trim(), maxTeams, players,
      { enabled: benchEnabled, startersCount, benchCount });
    setSubmitting(false);
    if (result.error) { setError(result.error); return; }
    navigate('/');
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 yard-lines pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-field-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <Trophy className="w-10 h-10 text-gold-400 mx-auto mb-3" />
          <h1 className="font-display text-4xl tracking-wider text-white">
            {hasExistingLeague ? 'CREATE NEW LEAGUE' : `WELCOME, ${displayName.toUpperCase()}`}
          </h1>
          <p className="text-turf-400 mt-2 text-sm">
            {hasExistingLeague
              ? 'Set up another league. You\'ll be the commissioner.'
              : 'Set up your fantasy league. You\'ll be the commissioner.'}
          </p>
        </div>

        <div className="card p-6 space-y-5">
          <form onSubmit={handle} className="space-y-5">
            <div>
              <label className="label">League Name</label>
              <input
                className="input text-lg"
                type="text"
                placeholder="e.g. Wilson Fantasy CFB 2025"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                maxLength={60}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label flex items-center gap-1">
                  <Users className="w-3 h-3" /> Players
                </label>
                <select
                  className="input"
                  value={players}
                  onChange={e => setPlayers(Number(e.target.value))}
                >
                  {[2,3,4,5,6,8,10,12].map(n => (
                    <option key={n} value={n}>{n} players</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Teams per Player</label>
                <select
                  className="input"
                  value={maxTeams}
                  onChange={e => setMaxTeams(Number(e.target.value))}
                >
                  {[5,6,7,8,9,10,12,15].map(n => (
                    <option key={n} value={n}>{n} teams</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card-inner p-4 text-sm text-turf-400 space-y-1">
              <p className="font-medium text-turf-300">Draft summary</p>
              <p>{players} players · {maxTeams} teams each · {players * maxTeams} total picks</p>
              <p>Snake draft · invite others after creation</p>
            </div>

            <div className="card-inner p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-turf-200">Enable Bench</p>
                  <p className="text-xs text-turf-500 mt-0.5">Split each roster into starters and bench, set weekly</p>
                </div>
                <Toggle
                  checked={benchEnabled}
                  onChange={() => setBenchEnabled(prev => !prev)}
                  label="Bench Enabled"
                />
              </div>

              {benchEnabled && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-turf-800">
                  <div>
                    <label className="label">Starters</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="1"
                      value={startersCount}
                      onChange={e => setStartersCount(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="label">Bench</label>
                    <input
                      className="input font-mono"
                      type="number"
                      min="0"
                      value={benchCount}
                      onChange={e => setBenchCount(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <p className="text-xs text-turf-500 col-span-2">
                    Must total {maxTeams} — currently {startersCount + benchCount}.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="text-sm bg-red-900/40 text-red-300 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting || !name.trim()} className="btn-primary w-full btn-lg">
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                : <>Create League <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
