import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../lib/supabase';

type Mode = 'signin' | 'signup';

function getRedirectTarget(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string') {
    return state.from;
  }
  return '/';
}

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const isSignUp = mode === 'signup';

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp({ email, password, fullName, businessName });
        // The closure's `session` is stale after await, so read the freshly stored session.
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.');
          return;
        }
      } else {
        await signIn(email, password);
      }
      navigate(getRedirectTarget(location.state), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-4)',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <h1 className="card-title" style={{ textAlign: 'center' }}>
          Smart Cash Flow Manager
        </h1>

        <div className="action-group" style={{ marginBottom: 'var(--space-4)' }}>
          <button
            type="button"
            className={`btn ${isSignUp ? 'btn-secondary' : 'btn-primary'}`}
            aria-pressed={!isSignUp}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`btn ${isSignUp ? 'btn-primary' : 'btn-secondary'}`}
            aria-pressed={isSignUp}
            onClick={() => switchMode('signup')}
          >
            Create account
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <div>
                <label className="label" htmlFor="full-name">
                  Full name
                </label>
                <input
                  id="full-name"
                  className="input"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="business-name">
                  Business name
                </label>
                <input
                  id="business-name"
                  className="input"
                  type="text"
                  required
                  autoComplete="organization"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-full">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-full">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              required
              minLength={6}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="form-full" role="alert" style={{ color: 'var(--color-danger)' }}>
              {error}
            </div>
          )}

          {notice && (
            <div className="form-full" role="status" style={{ color: 'var(--color-success)' }}>
              {notice}
            </div>
          )}

          <div className="form-full">
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={submitting}
            >
              {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="form-full" style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
          <a href="/features">See all features</a>
        </div>
      </div>
    </div>
  );
}
