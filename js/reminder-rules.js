/* Pure rules shared by the static app, Worker, and tests. No workout data
   leaves this module except the two eligibility fields returned by snapshot(). */
(function(root, factory){
  const rules = factory();
  if(typeof module === 'object' && module.exports) module.exports = rules;
  else root.SeannyReminderRules = rules;
})(globalThis, function(){
  'use strict';
  const ELIGIBILITY_TTL = 7 * 24 * 60 * 60 * 1000;
  const DELIVERY_WINDOW = 60 * 60 * 1000;
  const formatters = new Map();

  function parts(instant, timeZone){
    if(!formatters.has(timeZone)){
      if(formatters.size >= 100) formatters.clear();
      formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
        timeZone, year:'numeric', month:'2-digit', day:'2-digit',
        hour:'2-digit', minute:'2-digit', hourCycle:'h23'
      }));
    }
    const p = Object.fromEntries(formatters.get(timeZone).formatToParts(new Date(instant))
      .filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return { date:`${p.year}-${p.month}-${p.day}`, minute:Number(p.hour)*60 + Number(p.minute) };
  }
  function localDate(instant, timeZone){ return parts(instant, timeZone).date; }
  function validTime(value){ return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function validZone(value){
    if(typeof value !== 'string' || value.length > 100 || /^[+-]/.test(value)) return false;
    try{ parts(0, value); return true; }catch(e){ return false; }
  }
  function validExercise(ex){
    return !!ex && typeof ex.name === 'string' && ex.name.trim().length > 0 &&
      Number.isInteger(ex.sets) && ex.sets > 0 &&
      Number.isInteger(ex.repMin) && ex.repMin > 0 &&
      Number.isInteger(ex.repMax) && ex.repMax >= ex.repMin &&
      Number.isFinite(ex.increment) && ex.increment > 0;
  }
  function snapshot(state, now, timeZone){
    const date = localDate(now, timeZone);
    const day = state.days?.[state.cycleIndex];
    const currentDayEligible = !!day && String(day.label).trim().toLowerCase() !== 'rest' &&
      Array.isArray(day.exerciseIds) && day.exerciseIds.some(id => validExercise(state.exercises?.[id]));
    const onDate = value => {
      const instant = Date.parse(value);
      return Number.isFinite(instant) && localDate(instant, timeZone) === date;
    };
    // Old restLog entries have only a local date. New completions also have an
    // instant so travel can re-bucket them, just like workout timestamps.
    const restCompletions = Array.isArray(state.restCompletions) ? state.restCompletions : [];
    const datedRests = new Set(restCompletions.map(rest => rest.localDate));
    const completed = (state.logs || []).some(log => onDate(log.date)) ||
      restCompletions.some(rest => onDate(rest.date)) ||
      (state.restLog || []).some(rest => !datedRests.has(rest) && rest === date);
    return { currentDayEligible, completedLocalDate:completed ? date : null };
  }
  function eligibleToday(snapshot, now, timeZone){
    return snapshot.currentDayEligible && snapshot.completedLocalDate !== localDate(now, timeZone);
  }

  // Resolve a wall clock time with the offsets on either side of a transition.
  // A repeated time uses the FIRST occurrence. A nonexistent time is shifted
  // forward by the gap (02:30 -> 03:30 for a one-hour spring transition).
  // Recomputed from the IANA zone/date; a fixed UTC offset is never persisted.
  function scheduledInstant(date, time, timeZone){
    const target = Date.parse(`${date}T${time}:00Z`);
    const targetMinute = Number(time.slice(0,2))*60 + Number(time.slice(3));
    const offsets = new Set();
    for(let hours = -36; hours <= 36; hours += 6){
      const sample = target + hours*3600000;
      const p = parts(sample, timeZone);
      offsets.add(Date.parse(`${p.date}T00:00:00Z`) + p.minute*60000 - sample);
    }
    const candidates = [...offsets].map(offset => target-offset).filter(instant => {
      const p = parts(instant, timeZone);
      return p.date === date && p.minute >= targetMinute;
    });
    return candidates.length ? Math.min(...candidates) : null;
  }
  function dueDate(row, now){
    if(!row.currentDayEligible || row.expiresAt <= now || row.observedAt > now + 300000) return null;
    const date = localDate(now, row.timeZone);
    if(row.completedLocalDate === date) return null;
    const due = scheduledInstant(date, row.time, row.timeZone);
    return due !== null && now >= due && now < due + DELIVERY_WINDOW ? date : null;
  }
  return Object.freeze({ ELIGIBILITY_TTL, DELIVERY_WINDOW, parts, localDate,
    validTime, validZone, validExercise, snapshot, eligibleToday, scheduledInstant, dueDate });
});
