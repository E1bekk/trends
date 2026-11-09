// Новости: отдельный раздел, видео сюда не попадают.
const db = require('./_db.js');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  try {
    if (q.what === 'topics') {
      const topics = await db.rpc('news_topics');
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
      return res.status(200).json({ topics: topics || [] });
    }
    const items = await db.rpc('news_feed', {
      p_topic: /^[a-z_]{2,20}$/.test(q.topic || '') ? q.topic : null,
      p_country: /^[a-z]{2}$/.test(q.country || '') ? q.country : null,
      p_limit: Math.min(50, Math.max(1, parseInt(q.limit, 10) || 30)),
      p_skip: Math.min(2000, Math.max(0, parseInt(q.skip, 10) || 0))
    });
    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    res.status(200).json({ news: items || [] });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
};
