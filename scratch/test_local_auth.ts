import 'dotenv/config';

async function testLocal() {
  const baseUrl = 'http://127.0.0.1:3000';
  console.log(`Testing NextAuth login on ${baseUrl}...`);

  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  const setCookie = csrfRes.headers.get('set-cookie') || '';
  const { csrfToken } = await csrfRes.json();
  console.log('CSRF Token:', csrfToken);

  const cookie = setCookie.split(',').map(c => c.split(';')[0].trim()).join('; ');

  const signinRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie,
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'admin@primemarketingexperts.com',
      password: 'password123',
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    }).toString(),
  });

  console.log('Sign-in status:', signinRes.status);
  const data = await signinRes.json();
  console.log('Sign-in response:', data);
  if (signinRes.status === 200 && data.url && !data.url.includes('error=')) {
    console.log('✅ SUCCESS: Authenticated successfully as admin!');
  } else {
    console.log('❌ FAILED:', data);
  }
}

testLocal().catch(console.error);
