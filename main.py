import os
import time
import json
import requests
from datetime import datetime, timedelta
from queue import Queue
from threading import Thread
from collections import namedtuple
from pypeln import task as Task
from asyncio import run, get_event_loop, set_event_loop_policy, WindowsSelectorEventLoopPolicy
from aiohttp import TCPConnector, ClientSession, ClientTimeout
from flask import Flask, jsonify
from waitress import serve
from random import choice

if os.name == 'nt':
  set_event_loop_policy(WindowsSelectorEventLoopPolicy())

Proxy = namedtuple('Proxy', ['ip', 'port', 'latency'])

URL_TO_CHECK = 'http://online.nsmart.rs/sr/'
TCP_CONNECTION_LIMIT = 512
REQUEST_TIMEOUT_SECONDS = 8

proxy_check_queue = Queue()
ok_proxy_dict = dict()
next_check_at = datetime.now()

def ip_to_proxy(ip, latency):
  parts = ip.split(':')
  return Proxy(parts[0], parts[1], latency)

def clean_proxy_text(proxy_list):
  stripped_proxies = []
  for proxy in proxy_list:
    if ':' in proxy:
      parts = proxy.split(':')
      stripped_parts = [part.strip() for part in parts if any(char.isdigit() for char in part)]
      
      if len(stripped_parts) != 2: continue
      if stripped_parts[0] == '0.0.0.0': continue

      cleaned_proxy = ':'.join(stripped_parts)
      stripped_proxies.append(cleaned_proxy)
  
  return stripped_proxies

def load_proxylist_urls():
  with open('proxylist.json') as json_file:
    return json.load(json_file)

def get_proxies():
  proxies = set()
  proxylist_urls = load_proxylist_urls()

  print('Updating proxy list from ' + str(len(proxylist_urls)) + ' sources...')

  for url in proxylist_urls:
    try:
      response = requests.get(url)
      if response.status_code != 200: continue
      
      cleaned_proxies = clean_proxy_text(response.text.split('\n'))
      proxies.update(cleaned_proxies)

      print('Got proxy list from ' + url)
    except:
      print('Error getting proxy list from ' + url)

    time.sleep(2)

  return proxies

def enqueue_proxies_periodically():
  global next_check_at

  while True:
    if proxy_check_queue.qsize() > 0:
      next_check_at = datetime.now() + timedelta(seconds=5)
      time.sleep(5)
      continue

    proxies = get_proxies()

    for proxy in proxies:
      proxy_check_queue.put(proxy)

    for proxy in ok_proxy_dict:
      proxy_check_queue.put(proxy)

    queue_size = proxy_check_queue.qsize()
    timeout_seconds = 1.35 * REQUEST_TIMEOUT_SECONDS * queue_size / TCP_CONNECTION_LIMIT
    next_check_at = datetime.now() + timedelta(seconds=timeout_seconds)

    print('Total of ' + str(queue_size) + ' proxies to check')
    print('Next proxy list update in ' + str(round(timeout_seconds)) + ' seconds')
    print('Checking proxies...')

    time.sleep(timeout_seconds)

def start_queueing_proxies():
  t = Thread(target=enqueue_proxies_periodically)
  t.daemon = True
  t.start()

async def check_proxies():
  connector = TCPConnector(limit=TCP_CONNECTION_LIMIT)
  async with ClientSession(connector=connector) as session:

    headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Accept-Language': 'en-US,en;q=0.5',
    }

    async def check_proxy(proxy):
      try:
        start_time = get_event_loop().time()
        async with session.get(URL_TO_CHECK, 
          headers=headers,
          proxy='http://' + proxy, 
          ssl=False,
          allow_redirects=False,
          timeout=ClientTimeout(total=REQUEST_TIMEOUT_SECONDS)
        ) as response:

          if response.status not in [200, 302]: raise

          content = await response.content.read(255) # read 255 chars

          if 'nsmart' not in str(content):
            print('Proxy' + proxy + ' OK with ' + response.status + ' - but could not reach http://online.nsmart.rs')
            raise

          end_time = get_event_loop().time() - start_time
          latency = round(end_time * 1000)

          if not ok_proxy_dict.get(proxy):
            print('Found OK proxy: ' + proxy + ' with latency: ' + str(latency) + 'ms')

          ok_proxy_dict[proxy] = ip_to_proxy(proxy, latency)
          
      except Exception:
        ok_proxy_dict.pop(proxy, None)

    while True:
      if proxy_check_queue.qsize() == 0:
        print('Waiting for proxies to check...')

      # block until we have at least one proxy to check
      tasks = [proxy_check_queue.get(block=True)]

      # after that get as many proxies as we can without blocking
      max_tasks = min(TCP_CONNECTION_LIMIT, proxy_check_queue.qsize())
      tasks += [proxy_check_queue.get() for _ in range(max_tasks)]
      
      await Task.each(check_proxy, tasks, workers=TCP_CONNECTION_LIMIT)

def start_server():
  app = Flask(__name__)
  
  @app.get('/')
  def index():
    return {
      'proxiesInQueue': proxy_check_queue.qsize(),
      'proxiesOk': len(ok_proxy_dict),
      'nextCheckIn': max(0, round((next_check_at - datetime.now()).total_seconds()))
    }

  @app.get('/proxies')
  def proxies():
    proxies = [proxy._asdict() for proxy in ok_proxy_dict.values()]
    return jsonify(proxies)
  
  @app.get('/proxies/random')
  def random_proxy():
    proxy = choice(list(ok_proxy_dict.values()))
    return jsonify(proxy._asdict())
  
  @app.post('/proxies/<proxy>/delete')
  def delete_proxy(proxy):
    ok_proxy_dict.pop(proxy, None)
    return '', 200
  
  t = Thread(target= lambda: serve(app, host='0.0.0.0', port=8000))
  t.daemon = True
  t.start()

  print('* Server running on http://127.0.0.1:8000')
  
def main():
  # run in two separate threads
  start_server()
  start_queueing_proxies()

  # run in thread pool using event loop
  run(check_proxies())

main()