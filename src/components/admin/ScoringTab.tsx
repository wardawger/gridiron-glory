import { useState, useRef, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { League, ScoringSettings, StatBonusCategorySettings } from '../../types';
import { normalizeScoring, STAT_BONUS_CATEGORIES, STAT_BONUS_LABELS } from '../../types';
import { useCrossfadeVisibility } from '../../hooks/useCrossfade';
import { Toggle } from '../ui/Toggle';
import { Toast } from '../ui/Toast';

interface Props {
  league: League;
  onUpdateScoring: (s: ScoringSettings) => void;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TOAST_DURATION_MS = 3000;

export function ScoringTab({ league, onUpdateScoring }: Props) {
  const [scoring, setScoring] = useState<ScoringSettings>(normalizeScoring(league.scoring));
  const [showSavedToast, setShowSavedToast] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statBonusPanel  = useCrossfadeVisibility(scoring.stat_bonus_enabled);
  const spreadPanel     = useCrossfadeVisibility(scoring.spread_enabled);
  const freeAgencyPanel = useCrossfadeVisibility(scoring.free_agency_enabled);
  const waiverPanel     = useCrossfadeVisibility(scoring.waiver_enabled);

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  }, []);

  const handleSaveScoring = () => {
    onUpdateScoring(scoring);
    setShowSavedToast(true);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setShowSavedToast(false), TOAST_DURATION_MS);
  };

  return (
    <div className="space-y-4">
      {/* Roster conference limits */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Roster Conference Limits</h3>
        <p className="text-xs text-turf-400">Applies during the draft and to free agency/waiver moves.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">P4 Min (per conference)</label>
            <input
              className="input font-mono"
              type="number"
              min="0"
              value={scoring.p4_conf_min}
              onChange={e => setScoring(prev => ({ ...prev, p4_conf_min: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <label className="label">P4 Max (per conference)</label>
            <input
              className="input font-mono"
              type="number"
              min="1"
              value={scoring.p4_conf_max}
              onChange={e => setScoring(prev => ({ ...prev, p4_conf_max: parseInt(e.target.value) || 1 }))}
            />
          </div>
          <div>
            <label className="label">G5 Min (combined)</label>
            <input
              className="input font-mono"
              type="number"
              min="0"
              value={scoring.g5_conf_min}
              onChange={e => setScoring(prev => ({ ...prev, g5_conf_min: parseInt(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <label className="label">G5 Max (combined)</label>
            <input
              className="input font-mono"
              type="number"
              min="1"
              value={scoring.g5_conf_max}
              onChange={e => setScoring(prev => ({ ...prev, g5_conf_max: parseInt(e.target.value) || 1 }))}
            />
          </div>
        </div>
        <p className="text-xs text-turf-500">
          P4 = SEC, Big Ten, Big 12, ACC — each conference is capped separately. G5/non-P4 teams share one combined limit.
        </p>
      </div>

      {/* Base scoring */}
      <div className="card p-5 space-y-4">
        <h3 className="font-medium text-white text-sm">Base Scoring</h3>
        <p className="text-xs text-turf-400">Adjust scoring settings for this league. Changes apply to all weeks.</p>
        <div className="grid grid-cols-2 gap-4">
          {(['win', 'win_ranked', 'win_top15', 'win_top5', 'loss', 'loss_g5'] as const).map(key => {
            const labels: Record<string, string> = {
              win: 'Win', win_ranked: 'Beat Ranked', win_top15: 'Beat Top 15',
              win_top5: 'Beat Top 5', loss: 'Loss', loss_g5: 'Loss to G5',
            };
            return (
              <div key={key}>
                <label className="label">{labels[key]}</label>
                <input
                  className="input font-mono"
                  type="number"
                  step="0.5"
                  value={scoring[key] as number}
                  onChange={e => setScoring(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Statistical ranking bonus settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Statistical Ranking Bonuses</h3>
            <p className="text-xs text-turf-400 mt-0.5">
              Award points to whoever owns a top- or bottom-ranked team in each category
              (among all drafted teams). Shown as a live preview until conference championship
              week, then locks in.
            </p>
          </div>
          <Toggle
            checked={scoring.stat_bonus_enabled}
            onChange={() => setScoring(prev => ({ ...prev, stat_bonus_enabled: !prev.stat_bonus_enabled }))}
            label={`${scoring.stat_bonus_enabled ? 'Disable' : 'Enable'} statistical ranking bonuses`}
          />
        </div>

        {statBonusPanel.shown && (
          <div className={`space-y-3 pt-2 border-t border-turf-800 ${statBonusPanel.className}`}>
            {STAT_BONUS_CATEGORIES.map(cat => {
              const c = scoring.stat_bonus_categories[cat];
              const updateCat = (patch: Partial<StatBonusCategorySettings>) =>
                setScoring(prev => ({
                  ...prev,
                  stat_bonus_categories: {
                    ...prev.stat_bonus_categories,
                    [cat]: { ...prev.stat_bonus_categories[cat], ...patch },
                  },
                }));

              return (
                <div key={cat} className="card-inner p-3 space-y-3">
                  <p className="text-sm font-medium text-white">{STAT_BONUS_LABELS[cat]}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Top */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-turf-400 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-field-400" /> Top Bonus
                        </span>
                        <Toggle
                          checked={c.top_enabled}
                          onChange={() => updateCat({ top_enabled: !c.top_enabled })}
                          label={`${c.top_enabled ? 'Disable' : 'Enable'} ${STAT_BONUS_LABELS[cat]} top bonus`}
                        />
                      </div>
                      {c.top_enabled && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-turf-500 uppercase tracking-wide block mb-1"># of Teams</label>
                            <input
                              className="input font-mono text-center"
                              type="number"
                              min="1"
                              value={c.top_count}
                              onChange={e => updateCat({ top_count: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-turf-500 uppercase tracking-wide block mb-1">Points Each</label>
                            <input
                              className="input font-mono text-center"
                              type="number"
                              step="0.5"
                              value={c.top_points}
                              onChange={e => updateCat({ top_points: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-turf-400 flex items-center gap-1">
                          <TrendingDown className="w-3 h-3 text-red-300" /> Bottom Bonus
                        </span>
                        <Toggle
                          checked={c.bottom_enabled}
                          onChange={() => updateCat({ bottom_enabled: !c.bottom_enabled })}
                          label={`${c.bottom_enabled ? 'Disable' : 'Enable'} ${STAT_BONUS_LABELS[cat]} bottom bonus`}
                        />
                      </div>
                      {c.bottom_enabled && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-turf-500 uppercase tracking-wide block mb-1"># of Teams</label>
                            <input
                              className="input font-mono text-center"
                              type="number"
                              min="1"
                              value={c.bottom_count}
                              onChange={e => updateCat({ bottom_count: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-turf-500 uppercase tracking-wide block mb-1">Points Each</label>
                            <input
                              className="input font-mono text-center"
                              type="number"
                              step="0.5"
                              value={c.bottom_points}
                              onChange={e => updateCat({ bottom_points: parseFloat(e.target.value) || 0 })}
                            />
                            <p className="text-[10px] text-turf-500 mt-0.5">Negative values subtract points</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Spread betting settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Spread Betting</h3>
            <p className="text-xs text-turf-400 mt-0.5">Users pick which teams will cover or beat the spread each week</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-turf-400">{scoring.spread_enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              onClick={() => setScoring(prev => ({ ...prev, spread_enabled: !prev.spread_enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${scoring.spread_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {spreadPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${spreadPanel.className}`}>
            {/* Points mode toggle */}
            <div>
              <label className="label">Point Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_is_multiplier: false }))}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-all ${!scoring.spread_is_multiplier ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                >
                  Flat Points
                </button>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, spread_is_multiplier: true }))}
                  className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.spread_is_multiplier ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                >
                  Multiplier
                </button>
              </div>
              <p className="text-xs text-turf-500 mt-1">
                {scoring.spread_is_multiplier
                  ? 'Multiplier: earn a multiple of the base game points for covering'
                  : 'Flat: earn a set number of points for covering the spread'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">
                  {scoring.spread_is_multiplier ? 'Multiplier (×)' : 'Points for Covering'}
                </label>
                <input
                  className="input font-mono"
                  type="number"
                  step={scoring.spread_is_multiplier ? '0.1' : '0.5'}
                  min="0"
                  value={scoring.spread_points}
                  onChange={e => setScoring(prev => ({ ...prev, spread_points: parseFloat(e.target.value) || 0 }))}
                />
                <p className="text-xs text-turf-500 mt-0.5">
                  Penalty for missing: {scoring.spread_is_multiplier ? `×${scoring.spread_points}` : `-${scoring.spread_points} pts`}
                </p>
              </div>

              <div>
                <label className="label">Max Picks / Week</label>
                <input
                  className="input font-mono"
                  type="number"
                  min="1"
                  max="10"
                  value={scoring.spread_max_per_week}
                  onChange={e => setScoring(prev => ({ ...prev, spread_max_per_week: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <label className="label">Max Picks / Team / Season</label>
                <input
                  className="input font-mono"
                  type="number"
                  min="1"
                  max="20"
                  value={scoring.spread_max_per_team}
                  onChange={e => setScoring(prev => ({ ...prev, spread_max_per_team: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className="label">Captain Stacking</label>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <button
                    onClick={() => setScoring(prev => ({ ...prev, spread_allow_captain_stack: !prev.spread_allow_captain_stack }))}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.spread_allow_captain_stack ? 'bg-field-500' : 'bg-turf-700'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.spread_allow_captain_stack ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <span className="text-xs text-turf-400">
                    {scoring.spread_allow_captain_stack ? 'Allowed' : 'Not allowed'}
                  </span>
                </label>
                <p className="text-xs text-turf-500 mt-0.5">Pick spread on captain's team</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Free agency settings */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white text-sm">Free Agency</h3>
            <p className="text-xs text-turf-400 mt-0.5">Let managers drop a rostered team and add an available one</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-turf-400">{scoring.free_agency_enabled ? 'Enabled' : 'Disabled'}</span>
            <button
              onClick={() => setScoring(prev => ({ ...prev, free_agency_enabled: !prev.free_agency_enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${scoring.free_agency_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.free_agency_enabled ? 'left-5' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {freeAgencyPanel.shown && (
          <div className={`space-y-4 pt-2 border-t border-turf-800 ${freeAgencyPanel.className}`}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Max Adds/Drops / Season</label>
                <input
                  className="input font-mono"
                  type="number"
                  min="0"
                  value={scoring.fa_max_moves_per_season}
                  onChange={e => setScoring(prev => ({ ...prev, fa_max_moves_per_season: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="label">Max Adds/Drops / Week</label>
                <input
                  className="input font-mono"
                  type="number"
                  min="0"
                  value={scoring.fa_max_moves_per_week}
                  onChange={e => setScoring(prev => ({ ...prev, fa_max_moves_per_week: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Point Penalty</p>
                <p className="text-xs text-turf-500 mt-0.5">Subtract points the week a swap is made</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-turf-400">{scoring.fa_penalty_enabled ? 'Enabled' : 'Disabled'}</span>
                <button
                  onClick={() => setScoring(prev => ({ ...prev, fa_penalty_enabled: !prev.fa_penalty_enabled }))}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${scoring.fa_penalty_enabled ? 'bg-field-500' : 'bg-turf-700'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${scoring.fa_penalty_enabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </label>
            </div>

            {scoring.fa_penalty_enabled && (
              <div>
                <label className="label">Penalty Points</label>
                <input
                  className="input font-mono"
                  type="number"
                  min="0"
                  step="0.5"
                  value={scoring.fa_penalty_points}
                  onChange={e => setScoring(prev => ({ ...prev, fa_penalty_points: parseFloat(e.target.value) || 0 }))}
                />
                <p className="text-xs text-turf-500 mt-0.5">
                  −{scoring.fa_penalty_points} pts applied the week of each add/drop
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Waiver wire settings */}
      {scoring.free_agency_enabled && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-white text-sm">Waiver Wire</h3>
              <p className="text-xs text-turf-400 mt-0.5">Queue adds/drops as claims resolved on a set day, with priority for contested teams</p>
            </div>
            <Toggle
              checked={scoring.waiver_enabled}
              onChange={() => setScoring(prev => ({ ...prev, waiver_enabled: !prev.waiver_enabled }))}
              label="Waiver Wire Enabled"
            />
          </div>

          {waiverPanel.shown && (
            <div className={`space-y-4 pt-2 border-t border-turf-800 ${waiverPanel.className}`}>
              <div>
                <label className="label">Priority Metric</label>
                <p className="text-xs text-turf-500 mb-2">Who wins when two managers claim the same team</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setScoring(prev => ({ ...prev, waiver_priority_metric: 'worst_record' }))}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.waiver_priority_metric === 'worst_record' ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                  >
                    Worst Record
                  </button>
                  <button
                    onClick={() => setScoring(prev => ({ ...prev, waiver_priority_metric: 'fewest_points' }))}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-all ${scoring.waiver_priority_metric === 'fewest_points' ? 'bg-field-500 text-turf-950 border-field-500' : 'border-turf-700 text-turf-400 hover:text-white'}`}
                  >
                    Fewest Points
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Processing Day</label>
                  <select
                    className="input"
                    value={scoring.waiver_process_day}
                    onChange={e => setScoring(prev => ({ ...prev, waiver_process_day: parseInt(e.target.value) }))}
                  >
                    {WEEKDAY_NAMES.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">League Timezone</label>
                  <select
                    className="input"
                    value={scoring.waiver_timezone}
                    onChange={e => setScoring(prev => ({ ...prev, waiver_timezone: e.target.value }))}
                  >
                    <option value="America/New_York">Eastern</option>
                    <option value="America/Chicago">Central</option>
                    <option value="America/Denver">Mountain</option>
                    <option value="America/Los_Angeles">Pacific</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-turf-500">
                Claims are resolved at 9am local time on the selected day.
              </p>
            </div>
          )}
        </div>
      )}

      <button onClick={handleSaveScoring} className="btn-primary">
        Save Scoring Settings
      </button>

      <Toast message="Scoring settings saved" show={showSavedToast} />
    </div>
  );
}
