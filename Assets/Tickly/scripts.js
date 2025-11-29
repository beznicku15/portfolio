function setDisplay(target, value) {
	if (!target) return false;
	let el = null;
	if (typeof target === 'string') {
		el = document.querySelector(target);
	} else if (target instanceof Element) {
		el = target;
	} else {
		return false;
	}

	if (!el) return false;
	el.style.display = value;
	return true;
}

window.setDisplay = setDisplay;
window.show = (t) => setDisplay(t, 'flex');
window.hide = (t) => setDisplay(t, 'none');
let __openPopup = null;

function hideElement(target) {
	if (!target) return false;
	const el = (typeof target === 'string') ? document.querySelector(target) : target;
	if (!el) return false;

	el.style.display = 'none';

	if (el.__outsideClickHandler) {
		el.removeEventListener('click', el.__outsideClickHandler);
		delete el.__outsideClickHandler;
	}
	if (el.__escapeHandler) {
		document.removeEventListener('keydown', el.__escapeHandler);
		delete el.__escapeHandler;
	}

	// restore document scrolling when no more visible popups
	const anyOpen = document.querySelector('.popup[style*="display: flex"], .popup[style*="display:flex"]');
	if (!anyOpen) document.body.style.overflow = '';

	if (__openPopup === el) __openPopup = null;
	return true;
}

function showElement(selector) {
	if (!selector) return false;
	const el = (typeof selector === 'string') ? document.querySelector(selector) : selector;
	if (!el) return false;

	// close any other open popup
	if (__openPopup && __openPopup !== el) {
		hideElement(__openPopup);
	}

	el.style.display = 'flex';
	document.body.style.overflow = 'hidden'; // prevent background scroll while popup open
	__openPopup = el;

	if (el.__outsideClickHandler) return true;

	const outsideHandler = (e) => {
		// close when clicking the overlay (assumes overlay is the popup root)
		if (e.target === el) {
			hideElement(el);
		}
	};

	const escapeHandler = (e) => {
		if (e.key === 'Escape' || e.key === 'Esc') {
			hideElement(el);
		}
	};

	el.__outsideClickHandler = outsideHandler;
	el.addEventListener('click', outsideHandler);

	el.__escapeHandler = escapeHandler;
	document.addEventListener('keydown', escapeHandler);

	return true;
}

window.showElement = showElement;
window.hideElement = hideElement;

/* --- Simple client-side auth (demo only) ---
   Behavior:
   - Credentials (email + password hash) are stored in localStorage under `tickly_user` (persistent).
   - Session (logged-in flag + token) is stored in sessionStorage for the current tab and cleared on page load.
   - Page load will clear any previous session (auto-logout) while keeping stored credentials for convenience.
   SECURITY: This is a demo convenience only. Storing credentials locally is insecure. Replace with real backend auth for production.
*/

async function sha256hex(message) {
	const enc = new TextEncoder();
	const data = enc.encode(message);
	const hashBuf = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuf));
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function saveUserToLocal(userObj) {
	try {
		localStorage.setItem('tickly_user', JSON.stringify(userObj));
		return true;
	} catch (e) {
		return false;
	}
}

function getUserFromLocal() {
	try {
		const raw = localStorage.getItem('tickly_user');
		return raw ? JSON.parse(raw) : null;
	} catch (e) {
		return null;
	}
}

function clearSession() {
	sessionStorage.removeItem('tickly_session');
	sessionStorage.removeItem('tickly_loggedIn');
}

function setSession(sessionObj) {
	sessionStorage.setItem('tickly_session', JSON.stringify(sessionObj));
	sessionStorage.setItem('tickly_loggedIn', '1');
}

function isLoggedIn() {
	return !!sessionStorage.getItem('tickly_loggedIn');
}

function generateToken() {
	const arr = new Uint8Array(16);
	crypto.getRandomValues(arr);
	return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signUp(email, password, name) {
	const existing = getUserFromLocal();
	if (existing && existing.email === email) {
		return { ok: false, error: 'User already exists' };
	}
	const hash = await sha256hex(password);
	const user = { email, passwordHash: hash, name: name || '', createdAt: Date.now() };
	const ok = saveUserToLocal(user);
	return ok ? { ok: true } : { ok: false, error: 'Storage error' };
}

async function signIn(email, password) {
	const stored = getUserFromLocal();
	if (!stored || stored.email !== email) return { ok: false, error: 'No account found' };
	const hash = await sha256hex(password);
	if (hash !== stored.passwordHash) return { ok: false, error: 'Invalid credentials' };
	const token = generateToken();
	setSession({ email, token, issuedAt: Date.now() });
	return { ok: true, token };
}

function logoutUser() {
	clearSession();
	// update UI
	updateAuthUI();
}

function updateAuthUI() {
	const logged = isLoggedIn();
	const dashboardLink = document.getElementById('dashboard-link');
	// gather login-related buttons but exclude the dashboard link itself
	const allRightButtons = Array.from(document.querySelectorAll('.nav-right .nav-link, .nav-right .btn-primary'));
	const loginButtons = allRightButtons.filter(el => el.id !== 'dashboard-link');

	if (logged) {
		// hide login buttons/links and show dashboard
		loginButtons.forEach(el => el.style.display = 'none');
		if (dashboardLink) dashboardLink.style.display = 'inline-block';
	} else {
		loginButtons.forEach(el => el.style.display = 'inline-block');
		if (dashboardLink) dashboardLink.style.display = 'none';
	}
}

// wire up forms and auto-logout on load
document.addEventListener('DOMContentLoaded', () => {
	// auto-logout on page load (clear sessionStorage) except when on dashboard
	const path = window.location.pathname || '';
	if (!path.endsWith('dashboard.html')) {
		clearSession();
	}
	updateAuthUI();

	const loginForm = document.getElementById('login-form');
	const signupForm = document.getElementById('signup-form');
	const logoutBtn = document.getElementById('logout-btn');

	if (loginForm) {
		loginForm.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const email = document.getElementById('login-email').value.trim();
			const pw = document.getElementById('login-password').value;
			const res = await signIn(email, pw);
			const errEl = document.getElementById('login-error');
			if (!res.ok) {
				if (errEl) { errEl.style.display = 'block'; errEl.textContent = res.error || 'Login failed'; }
			} else {
				if (errEl) { errEl.style.display = 'none'; }
				updateAuthUI();
				// navigate to dashboard where logout will be available
				window.location.href = 'dashboard.html';
			}
		});
	}

	if (signupForm) {
		signupForm.addEventListener('submit', async (ev) => {
			ev.preventDefault();
			const name = document.getElementById('signup-name').value.trim();
			const email = document.getElementById('signup-email').value.trim();
			const pw = document.getElementById('signup-password').value;
			const res = await signUp(email, pw, name);
			const errEl = document.getElementById('signup-error');
			if (!res.ok) {
				if (errEl) { errEl.style.display = 'block'; errEl.textContent = res.error || 'Sign up failed'; }
			} else {
				if (errEl) { errEl.style.display = 'none'; }
				// auto sign-in after sign up and go to dashboard
				await signIn(email, pw);
				updateAuthUI();
				window.location.href = 'dashboard.html';
			}
		});
	}

	if (logoutBtn) {
		logoutBtn.addEventListener('click', (ev) => {
			ev.preventDefault();
			logoutUser();
		});
	}
});

