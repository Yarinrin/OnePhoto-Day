import { CameraMark } from '../components/Icons';
import { Screen } from '../components/Shell';
import { Button, EmptyState } from '../components/ui';
import { useRouter } from '../state/router';

export function NotFound({
  title = "We can't find that album",
  body = 'It may have been deleted, or the link is out of date.',
}: {
  title?: string;
  body?: string;
}) {
  const { push } = useRouter();
  return (
    <Screen nav>
      <div style={{ padding: '64px 20px 0' }}>
        <EmptyState
          art={<CameraMark size={92} />}
          title={title}
          body={body}
          action={
            <Button variant="primary" onClick={() => push({ name: 'home' })} style={{ marginTop: 8 }}>
              Back to my albums
            </Button>
          }
        />
      </div>
    </Screen>
  );
}
