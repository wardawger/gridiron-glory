import { useState } from 'react';
import { Loader2, Trophy, Users, ChevronRight } from 'lucide-react';

interface Props {
  displayName: string;
  onCreate: (name: string, maxTeams: number, playerCount: number) => Promise<{ error?: string }>;
}

export function CreateLeaguePage({ displayName, onCreate }: Props) {
  const [name, setName]         = useState('');
  const [maxTeams, setMaxTeams] = useState(10);
  const [players, setPlayers]   = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    const result = await onCreate(name.trim(), maxTeams, players);
    if (result.error) { setError(result.error); setSubmitting(false); }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 yard-lines pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-field-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <Trophy className="w-10 h-10 text-gold-400 mx-auto mb-3" />
          <h1 className="font-display text-4xl tracking-wider text-white">
            WELCOME, {displayName.toUpperCase()}
          </h1>
          <p className="text-turf-400 mt-2 text-sm">
            Set up your fantasy league. You'll be the commissioner.
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
