/**
 * Jest setup for Pitwall.
 *
 * - Mocks `react-native-video` with a lightweight component that renders a RN `View`
 *   (testID passthrough) and fires `onLoad` on mount, or `onError` with an HTTP 401 when
 *   the uri contains `simulate-401` (or when the legacy `__simulateError` prop is set).
 * - Mocks the tvOS remote event emitter so tests can drive the app with
 *   `global.emitTVEvent({eventType: 'playPause'})`.
 */

export type TVTestEvent = { eventType: string; eventKeyAction?: number; tag?: number };

declare global {
  var __tvListeners: Array<(evt: TVTestEvent) => void>;
  var emitTVEvent: (evt: TVTestEvent) => void;
  /**
   * When false the mocked <Video> does not fire `onLoad` on mount; tests then call
   * `instance.props.onLoad({duration: 0})` themselves (via `screen.UNSAFE_getAllByType(Video)`).
   * Defaults to true; reset it in an `afterEach` when you change it.
   */
  var __videoAutoLoad: boolean;
}

globalThis.__videoAutoLoad = true;

const g = globalThis as typeof globalThis & { __DEV__?: boolean };
if (typeof g.__DEV__ === 'undefined') {
  g.__DEV__ = true;
}

type MockVideoProps = {
  testID?: string;
  source?: { uri?: string };
  onLoad?: (e: { duration: number }) => void;
  onError?: (e: { error: { errorString?: string; errorCode?: string } }) => void;
  __simulateError?: boolean;
};

jest.mock('react-native-video', () => {
  const React = require('react');
  const { View } = require('react-native');

  const Video = React.forwardRef(function MockVideo(props: MockVideoProps, ref: unknown) {
    const uri = props.source?.uri;
    React.useImperativeHandle(ref, () => ({
      seek: () => {},
      pause: () => {},
      resume: () => {},
    }));
    React.useEffect(() => {
      if (!uri) {
        return;
      }
      if (props.__simulateError || uri.includes('simulate-401')) {
        props.onError?.({ error: { errorString: 'HTTP 401', errorCode: '401' } });
      } else if (uri.includes('simulate-fatal')) {
        props.onError?.({ error: { errorString: 'Source error', errorCode: '22001' } });
      } else if (globalThis.__videoAutoLoad !== false) {
        props.onLoad?.({ duration: 0 });
      }
      // Only re-run when the uri (or the mounted instance) changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uri]);
    return React.createElement(View, { testID: props.testID ?? 'video' });
  });

  const ResizeMode = {
    NONE: 'none',
    CONTAIN: 'contain',
    COVER: 'cover',
    STRETCH: 'stretch',
  };

  return {
    __esModule: true,
    default: Video,
    Video,
    ResizeMode,
    VideoDecoderProperties: {},
  };
});

jest.mock('react-native-safe-area-context', () => {
  // The library's jest mock is an ES default export; expose its members as named exports too.
  const mod = require('react-native-safe-area-context/jest/mock');
  const mock = mod.default ?? mod;
  return { __esModule: true, ...mock, default: mock };
});

globalThis.__tvListeners = [];
globalThis.emitTVEvent = (evt: TVTestEvent) => {
  [...globalThis.__tvListeners].forEach(l => l(evt));
};

jest.mock('react-native/Libraries/Components/TV/TVEventHandler', () => {
  const TVEventHandler = {
    addListener: (callback: (evt: TVTestEvent) => void) => {
      globalThis.__tvListeners.push(callback);
      return {
        remove: () => {
          const i = globalThis.__tvListeners.indexOf(callback);
          if (i >= 0) {
            globalThis.__tvListeners.splice(i, 1);
          }
        },
      };
    },
  };
  return { __esModule: true, default: TVEventHandler };
});

jest.mock('react-native/Libraries/Components/TV/TVEventControl', () => ({
  __esModule: true,
  default: {
    enableTVMenuKey: jest.fn(),
    disableTVMenuKey: jest.fn(),
    enableTVPanGesture: jest.fn(),
    disableTVPanGesture: jest.fn(),
    enableGestureHandlersCancelTouches: jest.fn(),
    disableGestureHandlersCancelTouches: jest.fn(),
  },
}));

