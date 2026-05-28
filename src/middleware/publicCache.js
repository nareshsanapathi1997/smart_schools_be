/** Cache-Control for public GET responses */
function publicCache(maxAge = 300) {
  return (req, res, next) => {
    if (req.method === 'GET') {
      res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=60`);
    }
    next();
  };
}

module.exports = publicCache;
