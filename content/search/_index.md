+++
title = 'Search'
layout = 'search'

# This page exists only so that Hugo emits /search/ for the header's magnifier, which
# renders through the theme's layouts/_default/search.html. There is no content to write:
# the index it queries is built after the Hugo build by Pagefind (see the "Build the search
# index" step in .github/workflows/hugo.yaml), so a plain `hugo server` session legitimately
# shows the template's "index is generated at deploy time" notice.
#
# Nothing links to the page besides that icon, so it is kept out of the sitemap and out of
# the section's RSS output rather than being advertised to crawlers and feed readers.
# `outputs` must come before any [table]: after `[sitemap]` a bare key joins that table.
outputs = ['html']
[sitemap]
  disable = true
+++
