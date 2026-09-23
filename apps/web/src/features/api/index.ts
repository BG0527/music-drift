/** 契约对接层：页面只从这里取数据（HTTP 出口唯一的模块）。 */
export {
  ApiError,
  apiFetch,
  apiGet,
  apiPost,
  apiPostVoid,
  type ApiRequestInit,
  type ApiViolation,
  type FetchLike,
  type FetchResponseLike,
  type ResponseSchema,
} from './client';
export {
  describeApiError,
  type ApiErrorExit,
  type ApiErrorKind,
  type ApiErrorView,
  type ApiExitKey,
} from './errors';
export { QUERY_KEYS, createQueryClient, queryRetry } from './query-client';
export { arrayOf, pageOf, segmentAudioUrl, type Page } from './queries';
export {
  useAnonymousCodes,
  useAdminReports,
  useLibraryMetadata,
  useMyBottles,
  useNotifications,
  useBottle,
  useBottleEvents,
  useMeQuery,
  useSeaBottle,
  useSeaPages,
  useSeaList,
  useSongs,
} from './queries';
export { useInvalidateBottle } from './mutations';
export {
  useCastVote,
  useChooseResolution,
  useCreateBottle,
  useDrawBottle,
  useLogin,
  useCreateReport,
  useDecideReport,
  useLogout,
  useMarkNotificationRead,
  usePutBack,
  useRegister,
} from './mutations';
