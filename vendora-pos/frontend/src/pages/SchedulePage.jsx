import React, { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import api from '../services/api';
import dayjs from 'dayjs';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export default function SchedulePage() {
  const [shifts, setShifts] = useState([]); const [loading, setLoading] = useState(true);
  const weekStart = dayjs().startOf('week').add(1,'day');
  useEffect(() => {
    api.get('/schedule/week', { params: { weekStart: weekStart.toISOString() } })
      .then(r => setShifts(r.shifts||r.data||r||[])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);
  return (
    <div className="p-6">
      <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900">Schedule</h1><p className="text-sm text-gray-500 mt-1">Week of {weekStart.format('D MMM YYYY')}</p></div>
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"/></div>
      : shifts.length === 0 ? <div className="bg-white rounded-xl border flex flex-col items-center justify-center py-16 text-gray-400"><Calendar size={48} className="mb-3 opacity-30"/><p className="font-medium">No shifts this week</p></div>
      : <div className="bg-white rounded-xl border overflow-hidden">
          <div className="grid grid-cols-8 border-b text-xs font-semibold text-gray-500 bg-gray-50">
            <div className="px-3 py-2">Staff</div>
            {DAYS.map((d,i) => <div key={d} className="px-3 py-2 text-center">{d}<div className="font-normal text-gray-400">{weekStart.add(i,'day').format('D MMM')}</div></div>)}
          </div>
          {shifts.map(s => <div key={s.staffId} className="grid grid-cols-8 border-b last:border-0 text-sm">
            <div className="px-3 py-2 font-medium text-gray-800">{s.staffName}</div>
            {DAYS.map((d,i) => { const shift = s.shifts?.[i]; return <div key={d} className="px-2 py-2 text-center">{shift ? <span className="inline-flex flex-col items-center text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5"><span>{shift.start}–{shift.end}</span></span> : <span className="text-gray-300 text-xs">—</span>}</div>; })}
          </div>)}
        </div>}
    </div>
  );
}
