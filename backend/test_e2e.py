import asyncio
import httpx

async def test_all():
    base = 'http://localhost:8000'
    
    async with httpx.AsyncClient(timeout=45.0) as client:

        print('=== 1. AUTH LOGIN ===')
        r = await client.post(f'{base}/api/v1/auth/login', json={'email': 'anita.desai@example.com', 'password': 'Password123!'})
        assert r.status_code == 200, f'Login FAILED ({r.status_code}): {r.text}'
        tokens = r.json()
        access = tokens['access_token']
        print('  -> OK')
        
        print('=== 2. AUTH /me ===')
        r = await client.get(f'{base}/api/v1/auth/me', headers={'Authorization': f'Bearer {access}'})
        assert r.status_code == 200, f'/me FAILED ({r.status_code}): {r.text}'
        profile = r.json()
        customer_id = profile['customer_id']
        print(f'  -> Name={profile["name"]}, Acct={profile["account_number"]}, Plan={profile["plan"]}')
        
        print('=== 3. CREATE SESSION (with customer_id) ===')
        r = await client.post(f'{base}/api/v1/conversations/sessions',
                              json={'customer_id': customer_id, 'channel': 'web', 'language': 'en'})
        assert r.status_code == 200, f'Session FAILED ({r.status_code}): {r.text}'
        session = r.json()
        print(f'  -> session_id={session["session_id"]}, status={session["status"]}')
        
        print('=== 4. ANALYTICS DASHBOARD ===')
        r = await client.get(f'{base}/api/v1/analytics/dashboard')
        assert r.status_code == 200, f'Analytics FAILED ({r.status_code}): {r.text}'
        m = r.json()
        print(f'  -> total_conversations={m.get("total_conversations")}, active_sessions={m.get("active_sessions")}')
        
        print('=== 5. CRM CUSTOMERS ===')
        r = await client.get(f'{base}/api/v1/crm/customers?limit=3')
        assert r.status_code == 200, f'CRM FAILED ({r.status_code}): {r.text}'
        crm = r.json()
        count = len(crm) if isinstance(crm, list) else len(crm.get("customers", []))
        print(f'  -> loaded {count} customers')

        print('=== 6. SCHEDULING STATS ===')
        r = await client.get(f'{base}/api/v1/scheduling/stats')
        assert r.status_code == 200, f'Scheduling FAILED ({r.status_code}): {r.text}'
        sched = r.json()
        print(f'  -> total_appointments={sched.get("total_appointments")}, agents_available={sched.get("agents_available")}')
        
        print('=== 7. BILLING INVOICES ===')
        r = await client.get(f'{base}/api/v1/billing/invoices/{customer_id}')
        print(f'  -> status={r.status_code}')
        
        print('=== 8. HEALTH CHECK ===')
        r = await client.get(f'{base}/health')
        assert r.status_code == 200, f'Health FAILED'
        print(f'  -> {r.json()}')
        
        print()
        print('ALL TESTS PASSED')

asyncio.run(test_all())
