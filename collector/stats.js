// Пересчёт цифр по дням. Гоняем по расписанию: сегодня и пару дней назад,
// чтобы досчитались те, кто смотрел после полуночи.
const db = require('../api/_db.js');

async function main() {
  await db.check();
  await db.rpc('roll_days', { p_days: 3 });
  const now = await db.rpc('stats_now') || {};
  const line = `Людей всего ${now.users_total || 0} · сегодня смотрели ${now.users_today || 0} · новых ${now.new_today || 0} · роликов ${now.videos_total || 0}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY)
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Цифры\n\n${line}\n`);
}

main().catch(e => { console.error('Не получилось:', e.message); process.exit(1); });
