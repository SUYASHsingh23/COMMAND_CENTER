import urllib.request
import json

try:
    with urllib.request.urlopen('http://127.0.0.1:8000/api/v1/scheduling/appointments') as response:
        data = json.loads(response.read().decode())
        print("Total appointments:", len(data))
        if data:
            appt_id = data[0]['appointment_id']
            with urllib.request.urlopen(f'http://127.0.0.1:8000/api/v1/scheduling/appointments/{appt_id}') as res2:
                detail = json.loads(res2.read().decode())
                print(json.dumps(detail, indent=2))
except Exception as e:
    print(e)
