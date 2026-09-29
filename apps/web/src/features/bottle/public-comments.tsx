import { useState } from 'react';
import { Button } from '../../design-system';
import { usePublicComments } from '../api/queries';
import { useCreatePublicComment, useDeletePublicComment } from '../api/mutations';
import { ConflictNotice } from './conflict-notice';
import { ReportDialog } from './report-dialog';

export interface PublicCommentsProps {
  bottleId: string;
  /** 匿名访客仍可读；只有已登录用户显示发布入口。 */
  canComment: boolean;
  /** 宿主位于 Modal 内时传入：先退出宿主 Modal，再串行打开举报 Modal。 */
  onReport?: ((commentId: string) => void) | undefined;
}

export function PublicComments({ bottleId, canComment, onReport }: PublicCommentsProps) {
  const comments = usePublicComments(bottleId);
  const create = useCreatePublicComment(bottleId);
  const remove = useDeletePublicComment(bottleId);
  const [draft, setDraft] = useState('');
  const [reportId, setReportId] = useState<string | null>(null);
  const content = draft.trim();
  const characterCount = [...content].length;
  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="public-comments-title" className="min-w-0 rounded-2xl border border-line/20 bg-ink/55 p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 id="public-comments-title" className="text-lg font-bold text-paper">公开评论</h2>
        <span className="text-xs text-muted">账号实名 · 每页 20 条</span>
      </div>

      {canComment ? (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (characterCount < 1 || characterCount > 200) return;
            const submitted = content;
            void create
              .mutateAsync({ content: submitted })
              .then(() => setDraft((current) => (current.trim() === submitted ? '' : current)))
              .catch(() => undefined);
          }}
        >
          <label htmlFor="public-comment-content" className="text-sm font-medium text-paper">
            写公开评论
          </label>
          <textarea
            id="public-comment-content"
            rows={2}
            disabled={create.isPending}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-20 w-full resize-none rounded-xl border border-line/30 bg-water-void/45 px-4 py-3 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-coral"
          />
          <div className="flex items-center justify-between gap-3">
            <span className={characterCount > 200 ? 'text-sm text-danger' : 'text-sm text-muted'}>
              {characterCount}/200
            </span>
            <Button type="submit" disabled={characterCount < 1 || characterCount > 200} loading={create.isPending}>
              发布评论
            </Button>
          </div>
          {create.isError ? <ConflictNotice error={create.error} /> : null}
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">登录后可以留下公开评论。</p>
      )}

      <div className="mt-5 max-h-64 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {comments.isLoading ? <p className="text-sm text-muted">正在听海里的回声…</p> : null}
        {comments.isError ? <ConflictNotice error={comments.error} /> : null}
        {!comments.isLoading && !comments.isError && items.length === 0 ? (
          <p className="text-sm text-muted">还没有评论，第一句留给你。</p>
        ) : null}
        {items.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-line/15 bg-water-void/25 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span className="font-medium text-glass">@{comment.authorAccount}</span>
              <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-paper">{comment.content}</p>
            <div className="mt-2 flex justify-end">
              {comment.isMine ? (
                <button
                  type="button"
                  disabled={remove.isPending}
                  className="min-h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-paper"
                  onClick={() => remove.mutate(comment.id)}
                >
                  删除这条评论
                </button>
              ) : canComment ? (
                <button
                  type="button"
                  className="min-h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-paper"
                  onClick={() => {
                    if (onReport !== undefined) onReport(comment.id);
                    else setReportId(comment.id);
                  }}
                >
                  举报这条评论
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {remove.isError ? <ConflictNotice error={remove.error} /> : null}

      {comments.hasNextPage ? (
        <Button variant="ghost" loading={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()}>
          加载更多评论
        </Button>
      ) : null}

      {onReport === undefined ? (
        <ReportDialog
          open={reportId !== null}
          targetType="COMMENT"
          targetId={reportId ?? bottleId}
          onClose={() => setReportId(null)}
        />
      ) : null}
    </section>
  );
}
