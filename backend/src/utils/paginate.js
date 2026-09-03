// Every paginated list endpoint parses page/limit the same way and returns
// the same `pagination` shape, so the frontend has exactly one pattern to
// handle regardless of which resource it's paging through.

function parsePagination(query, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildPaginationMeta(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { parsePagination, buildPaginationMeta };
