import {readFile, writeFile, mkdir, appendFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function sanitizeSnapshot(input, now = Date.now()) {
  const generated = Date.parse(input?.generated_at);
  if (input?.version !== 1 || !Number.isFinite(generated) || generated > now+60000 ||
      !Array.isArray(input.tracks) || input.tracks.length > 100) throw new Error('Invalid snapshot');
  if (now-generated > 20*60000) throw new Error('Supabase snapshot is older than 20 minutes');
  const seen = new Set();
  const tracks = input.tracks.map(track => {
    if (typeof track.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(track.id) || seen.has(track.id) ||
        !Array.isArray(track.entries) || track.entries.length > 10) throw new Error('Invalid track');
    seen.add(track.id);
    let lastTime = 0, lastRank = 0;
    const entries = track.entries.map((entry,index) => {
      if (typeof entry.nick !== 'string' || entry.nick.length > 120 ||
          !Number.isSafeInteger(entry.best_time_ms) || entry.best_time_ms <= 0 ||
          entry.best_time_ms < lastTime || !Number.isSafeInteger(entry.rank) ||
          entry.rank !== (index && entry.best_time_ms === lastTime ? lastRank : index+1)) {
        throw new Error('Invalid leaderboard entry');
      }
      lastTime = entry.best_time_ms; lastRank = entry.rank;
      // Explicit allowlist prevents accidental publication of IDs, ghosts or profile fields.
      return {rank:entry.rank,nick:entry.nick,best_time_ms:entry.best_time_ms};
    });
    return {id:track.id,entries};
  });
  return {version:1,generated_at:new Date(generated).toISOString(),refresh_seconds:300,tracks};
}

export async function sync(output, {fetchImpl = fetch, now = Date.now()} = {}) {
  const config = JSON.parse(await readFile(new URL('../ops/rankings-config.json',import.meta.url),'utf8'));
  await mkdir(output,{recursive:true});
  let usage = {version:1,started_at:new Date(now).toISOString(),days:[]};
  try { usage = JSON.parse(await readFile(resolve(output,'usage.json'),'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const today = new Date(now).toISOString().slice(0,10);
  const day = usage.days.find(day=>day.date===today) || {date:today,requests:0,successes:0,failures:0,response_body_bytes:0};
  if (!usage.days.includes(day)) usage.days.push(day);
  day.requests++;
  usage.last_attempt_at = new Date(now).toISOString();
  let failure = null;
  try {
    const url = new URL('/rest/v1/'+config.snapshot_table,config.url);
    url.search = 'select=payload&id=eq.true&limit=1';
    const response = await fetchImpl(url,{
      headers:{apikey:config.publishable_key,'Accept-Encoding':'identity'},
      signal:AbortSignal.timeout(15000)
    });
    const raw = await response.text();
    day.response_body_bytes += Buffer.byteLength(raw);
    if (!response.ok) throw new Error('Supabase HTTP '+response.status);
    if (Buffer.byteLength(raw)>512000) throw new Error('Snapshot response exceeds limit');
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length!==1) throw new Error('Snapshot missing');
    const snapshot = sanitizeSnapshot(rows[0].payload,now);
    const serialized = JSON.stringify(snapshot)+'\n';
    await writeFile(resolve(output,'leaderboards.json'),serialized);
    day.successes++;
    usage.last_success_at = new Date(now).toISOString();
    usage.last_snapshot_at = snapshot.generated_at;
    usage.last_response_body_bytes = Buffer.byteLength(raw);
    usage.last_snapshot_bytes = Buffer.byteLength(serialized);
    usage.projected_30_day_response_body_bytes = Buffer.byteLength(raw)*8640;
    usage.last_error = null;
  } catch(error) {
    day.failures++;
    // No response content or credentials in logs.
    failure = error instanceof Error ? error.message : 'Snapshot refresh failed';
    usage.last_error = failure;
  }
  usage.days = usage.days.filter(day=>Date.parse(day.date)>=now-90*86400000);
  usage.measurement = 'Response body bytes read by the scheduled exporter; excludes HTTP overhead, other clients and other Supabase services. Not a billing total.';
  await writeFile(resolve(output,'usage.json'),JSON.stringify(usage,null,2)+'\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      '### Rankings snapshot\n\n'+
      '- Supabase requests today: '+day.requests+'\n'+
      '- Response body bytes today: '+day.response_body_bytes+'\n'+
      '- Successful updates today: '+day.successes+'\n'+
      '- Failed updates today: '+day.failures+'\n'+
      '- Last successful update: '+(usage.last_success_at || 'none')+'\n'+
      '- 30-day projection (body only): '+(usage.projected_30_day_response_body_bytes || 0)+' bytes\n');
  }
  return {ok:!failure,error:failure,usage};
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const result = await sync(resolve(process.argv[2] || 'ranking-cache'));
  console.log(JSON.stringify({ok:result.ok,error:result.error,last_response_body_bytes:result.usage.last_response_body_bytes}));
  if (!result.ok) process.exitCode=1;
}
