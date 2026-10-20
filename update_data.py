#!/usr/bin/env python3
"""Futbol Pulse Hybrid Data - GitHub Actions static JSON builder.

Stdlib only, no API keys. Raw ESPN payloads are deliberately restricted to
standings, team directories and monthly fixture data; never live scoreboards.
Do not publish photos or private data.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.request

LEAGUES = ('eng.1', 'esp.1', 'arg.1', 'fra.1', 'ita.1', 'ger.1',
           'uefa.champions', 'uefa.europa', 'por.1', 'ned.1')
API_SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
API_STAND = 'https://site.api.espn.com/apis/v2/sports/soccer/'
MAX_BYTES = 3_000_000
USER_AGENT = 'FutbolPulse-Hybrid/1.7.1 (static cache; GitHub Actions; community project)'


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(t: dt.datetime) -> str:
    return t.isoformat(timespec='seconds').replace('+00:00', 'Z')


def month_add(day: dt.date, offset: int) -> str:
    n = day.year * 12 + day.month - 1 + offset
    return f'{n // 12:04d}{n % 12 + 1:02d}'


def request_json(url: str):
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=16) as response:
        if int(response.status) != 200:
            raise RuntimeError(f'HTTP {response.status}')
        raw = response.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ValueError('Respuesta demasiado grande')
        return json.loads(raw)


def limited_teams(raw):
    """Keep useful public team directory fields; no images are embedded."""
    teams = raw.get('sports', []) if isinstance(raw, dict) else []
    result = []
    # ESPN's /teams uses sports[].leagues[].teams[]; other answers use teams[]
    sources = []
    if isinstance(raw, dict):
        sources += [raw.get('teams', [])]
    for sport in teams:
        for league in sport.get('leagues', []):
            sources.append(league.get('teams', []))
    ids = set()
    for group in sources:
        if not isinstance(group, list):
            continue
        for item in group:
            obj = item.get('team', item) if isinstance(item, dict) else {}
            if not isinstance(obj, dict):
                continue
            ident = str(obj.get('id') or '')
            if not ident or ident in ids:
                continue
            ids.add(ident)
            logos = obj.get('logos') or []
            logo = obj.get('logo') or (logos[0].get('href') if logos and isinstance(logos[0], dict) else '')
            result.append({'team': {'id': ident, 'displayName': str(obj.get('displayName') or obj.get('name') or ''),
                                     'abbreviation': str(obj.get('abbreviation') or ''), 'logo': str(logo or '')}})
    return {'teams': result}


def fixture_slim(raw):
    """Preserve ESPN event structure needed by parseESPN, removing unused bulk."""
    events = raw.get('events') if isinstance(raw, dict) else None
    if not isinstance(events, list):
        raise ValueError('Eventos ausentes')
    result = []
    for event in events:
        if not isinstance(event, dict):
            continue
        competitions = event.get('competitions') or [{}]
        comp = competitions[0] if competitions else {}
        rivals = []
        for c in comp.get('competitors', []):
            t = c.get('team') or {}
            rivals.append({'homeAway': c.get('homeAway', ''), 'score': c.get('score'),
                           'team': {'id': str(t.get('id') or ''), 'displayName': t.get('displayName') or t.get('name') or '',
                                    'logo': t.get('logo') or (t.get('logos') or [{}])[0].get('href', '')}})
        result.append({'id': str(event.get('id') or ''), 'date': event.get('date', ''),
                       'status': event.get('status', {}),
                       'week': event.get('week'),
                       'competitions': [{'date': comp.get('date'), 'competitors': rivals,
                                         'week': comp.get('week'),
                                         'venue': {'fullName': (comp.get('venue') or {}).get('fullName', '')}}]})
    return {'events': result}


def build_plan(today):
    plan = []
    for league in LEAGUES:
        plan.append(('standings', league, None, f'{API_STAND}{league}/standings'))
        plan.append(('teams', league, None, f'{API_SITE}{league}/teams?limit=250'))
        for month in (month_add(today, 0), month_add(today, 1)):
            plan.append(('fixtures', league, month, f'{API_SITE}{league}/scoreboard?dates={month}&limit=500'))
    return plan


def run_task(task, fetch):
    kind, league, month, url = task
    try:
        raw = fetch(url)
        if kind == 'standings':
            if not isinstance(raw, dict) or not any(k in raw for k in ('children', 'standings', 'entries')):
                raise ValueError('Formato de tabla no reconocido')
            data = raw
        elif kind == 'fixtures':
            data = fixture_slim(raw)
            # Sólo eventos del mes solicitado; evita respuestas que ignoran dates=YYYYMM.
            data['events'] = [e for e in data['events'] if str(e.get('date') or '')[:7].replace('-', '') == month]
            # Reject unexpectedly empty monthly response to prevent wrong 'no matches'.
            if not data['events']:
                raise ValueError('Mes sin eventos publicados (no se guarda como completo)')
        else:
            data = limited_teams(raw)
            if not data['teams']:
                raise ValueError('Directorio sin equipos')
        return task, data, None
    except (urllib.error.URLError, ValueError, RuntimeError, TimeoutError, KeyError, TypeError, json.JSONDecodeError) as exc:
        return task, None, f'{exc.__class__.__name__}: {str(exc)[:140]}'


def build(fetch=request_json, date=None, max_workers=4):
    today = date or utcnow().date()
    stamp = iso(utcnow())
    out = {'schema': 1, 'generatedAt': stamp, 'provider': 'ESPN (API publica no oficial)',
           'note': 'Solo información secundaria; marcadores en vivo desde el dispositivo.',
           'standings': {}, 'fixtures': {}, 'teams': {}, 'warnings': []}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as pool:
        tasks = list(pool.map(lambda x: run_task(x, fetch), build_plan(today)))
    for task, data, error in tasks:
        kind, league, month, url = task
        if error:
            out['warnings'].append(f'{league} {kind} {month or ""}: {error}')
            continue
        entry = {'fetchedAt': stamp, 'payload': data}
        if kind == 'fixtures':
            out['fixtures'].setdefault(league, {})[month] = entry
        else:
            out[kind][league] = entry
    out['counts'] = {'standings': len(out['standings']), 'teams': len(out['teams']),
                     'fixtures': sum(len(v) for v in out['fixtures'].values()), 'errors': len(out['warnings'])}
    return out


def main():
    parser = argparse.ArgumentParser(description='Generate static community data from public ESPN endpoints')
    parser.add_argument('--output', default='pulse-data.json')
    args = parser.parse_args()
    data = build()
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Pulse Hybrid Data:', data['counts'])
    for warning in data['warnings'][:10]:
        print('Aviso:', warning)
    if not (data['standings'] or data['fixtures'] or data['teams']):
        # Avoid replacing last published working site during a full API outage.
        raise SystemExit('Ninguna API devolvio datos validos. Se cancela el despliegue; se conserva Pages.')


if __name__ == '__main__':
    main()
