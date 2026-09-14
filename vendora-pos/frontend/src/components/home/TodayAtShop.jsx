import React from 'react';
import { Sunrise, FileClock, CalendarHeart, Sparkles, Banknote, Lightbulb } from 'lucide-react';
import { buildTodaySignals } from '../../lib/todaySignals';

const KIND_ICON = {
  deadline: FileClock,
  event: CalendarHeart,
  weekend: Sparkles,
  money: Banknote,
  tip: Lightbulb,
};

const TONE_STYLE = {
  warn: { wrap: 'bg-danger-light', icon: 'text-danger-dark', text: 'text-danger-dark' },
  info: { wrap: 'bg-primary-50', icon: 'text-primary', text: 'text-gray-700' },
  event: { wrap: 'bg-warning-light', icon: 'text-warning-dark', text: 'text-gray-700' },
  tip: { wrap: 'bg-primary-50', icon: 'text-primary', text: 'text-gray-700' },
  neutral: { wrap: 'bg-gray-50', icon: 'text-gray-400', text: 'text-gray-700' },
};

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Today at the shop" — the morning glance, tailored to the shop's family. */
export default function TodayAtShop({ familyId }) {
  const signals = buildTodaySignals(familyId);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sunrise className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-sm font-bold text-gray-900">{greeting()} — today at the shop</h2>
          <p className="text-xs text-gray-400">{today}</p>
        </div>
      </div>

      {signals.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing pressing today. Have a good one.</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((s, i) => {
            const Icon = KIND_ICON[s.kind] || Lightbulb;
            const tone = TONE_STYLE[s.tone] || TONE_STYLE.neutral;
            return (
              <li key={i} className={`flex items-start gap-3 rounded-xl p-3 ${tone.wrap}`}>
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} strokeWidth={2} />
                <span className={`text-sm ${tone.text}`}>{s.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
