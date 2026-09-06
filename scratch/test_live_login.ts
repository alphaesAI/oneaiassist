import 'dotenv/config';

async function testLogin(baseUrl: string) {
  console.log(`\n================================================================`);
  console.log(`🔐 TESTING LOGIN ON: ${baseUrl}`);
  console.log(`================================================================`);

  try {
    // 1. Fetch CSRF token from NextAuth
    console.log(`1. Fetching CSRF token from ${baseUrl}/api/auth/csrf ...`);
    const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const setCookieHeader = csrfRes.headers.get('set-cookie') || '';
    const csrfData = await csrfRes.json().catch(() => ({}));
    const csrfToken = csrfData.csrfToken;
    console.log(`   CSRF Token received: ${csrfToken ? '✅ YES (' + csrfToken.slice(0, 15) + '...)' : '❌ NO'}`);
    console.log(`   Cookies received: ${setCookieHeader ? '✅ YES' : '❌ NONE'}`);

    if (!csrfToken) {
      console.error(`❌ Failed to retrieve CSRF token from ${baseUrl}`);
      return;
    }

    // Parse cookies from CSRF response to send with credentials POST
    const cookieString = setCookieHeader
      .split(',')
      .map((c) => c.split(';')[0].trim())
      .join('; ');

    // 2. Submit Credentials Sign-In
    console.log(`2. Submitting credentials for admin@primemarketingexperts.com ...`);
    const signinBody = new URLSearchParams({
      csrfToken,
      email: 'admin@primemarketingexperts.com',
      password: 'password123',
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    });

    const signinRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieString,
        'Accept': 'application/json',
      },
      body: signinBody.toString(),
      redirect: 'manual',
    });

    const signinStatus = signinRes.status;
    const signinLocation = signinRes.headers.get('location') || '';
    const signinCookies = signinRes.headers.get('set-cookie') || '';
    const signinText = await signinRes.text();

    console.log(`   Sign-in Response Status: ${signinStatus}`);
    console.log(`   Redirect Location: ${signinLocation || 'None'}`);
    console.log(`   Session Cookies: ${signinCookies.includes('session-token') ? '✅ YES (Session Token Issued)' : signinCookies ? 'Cookies Set' : '❌ NONE'}`);

    let signinJson: any = null;
    try {
      signinJson = JSON.parse(signinText);
      console.log(`   Response JSON:`, signinJson);
    } catch {
      console.log(`   Response Text snippet:`, signinText.slice(0, 200));
    }

    // 3. Evaluate Result
    if (
      signinStatus === 200 ||
      signinStatus === 302 ||
      (signinJson && signinJson.url && !signinJson.url.includes('error='))
    ) {
      if (signinJson?.url?.includes('error=')) {
        console.error(`❌ Login failed with error in redirect URL: ${signinJson.url}`);
      } else {
        console.log(`✅ SUCCESS: Authentication succeeded on ${baseUrl}!`);
      }
    } else {
      console.error(`❌ Login failed on ${baseUrl}. Status: ${signinStatus}`);
    }
  } catch (err: any) {
    console.error(`❌ Connection error on ${baseUrl}:`, err?.message || err);
  }
}

async function main() {
  await testLogin('https://oneai.drgodly.com');
  await testLogin('http://localhost:3000');
}

main();
