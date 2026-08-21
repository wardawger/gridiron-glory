import { Link } from 'react-router-dom';
import { ShieldCheck, BarChart3, Database, Mail } from 'lucide-react';

export function PrivacyPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field-500 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-turf-950" />
          </div>
          <div>
            <h1 className="font-display text-2xl tracking-wide text-white">Privacy</h1>
            <p className="text-turf-500 text-sm">What Gridiron Glory collects, and why</p>
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-medium text-white text-sm">What we collect</h3>
          <p className="text-sm text-turf-400">
            To run the app, we store the account info and league data you'd expect — your email, display name,
            roster avatar, and the picks/scores you make in your leagues. This lives in Supabase and is only
            visible to you and the other members of your leagues.
          </p>
          <p className="text-sm text-turf-400">
            We also use two analytics tools to understand how the app is actually used — which pages get visited,
            which features get clicked, and where things break:
          </p>
          <ul className="space-y-2 mt-1">
            <li className="flex items-start gap-2 text-sm text-turf-300">
              <BarChart3 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <span><span className="text-white font-medium">Google Analytics</span> — page views and basic session info (device, rough location, referrer).</span>
            </li>
            <li className="flex items-start gap-2 text-sm text-turf-300">
              <BarChart3 className="w-4 h-4 text-field-400 flex-shrink-0 mt-0.5" />
              <span><span className="text-white font-medium">PostHog</span> — product usage events (e.g. a draft pick made, a league created) so we know what's actually getting used.</span>
            </li>
          </ul>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-medium text-white text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-turf-400" /> What we don't do
          </h3>
          <p className="text-sm text-turf-400">
            We don't sell or share your data with third parties, and we don't run ads. Analytics data is used
            only to improve the app itself.
          </p>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-medium text-white text-sm flex items-center gap-2">
            <Mail className="w-4 h-4 text-turf-400" /> Questions
          </h3>
          <p className="text-sm text-turf-400">
            If you have questions about your data, reach out to your league commissioner or whoever invited you.
          </p>
        </div>

        <Link to="/" className="btn-secondary w-full justify-center">Back to Gridiron Glory</Link>
      </div>
    </div>
  );
}
