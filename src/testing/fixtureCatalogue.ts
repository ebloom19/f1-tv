import { buildCatalogue } from '../catalogue/build';
import type { F1Catalogue } from '../catalogue/types';
import type { XtreamLiveCategory, XtreamLiveStream } from '../provider/xtream/types';
import streamsJson from '../../__tests__/fixtures/xtream-live-streams.f1.json';
import categoriesJson from '../../__tests__/fixtures/xtream-live-categories.json';

export const FIXTURE_STREAMS = streamsJson as XtreamLiveStream[];
export const FIXTURE_CATEGORIES = categoriesJson as XtreamLiveCategory[];

/** The catalogue built from the real (scrubbed) panel fixture. */
export function fixtureCatalogue(): F1Catalogue {
  return buildCatalogue(FIXTURE_STREAMS, FIXTURE_CATEGORIES);
}
