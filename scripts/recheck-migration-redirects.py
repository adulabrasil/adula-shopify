"""Read-only technical HTTP check. Usage: python scripts/recheck-migration-redirects.py INPUT.csv OUTPUT_DIR
Requires lxml. Does not import redirects or write to Shopify.
"""
import urllib.request,urllib.error,concurrent.futures,csv,json,time,pathlib,sys
from urllib.parse import urlsplit
from lxml import html
ROOT=pathlib.Path(sys.argv[2]);ROOT.mkdir(parents=True,exist_ok=True);BASE='https://adula-brasil.myshopify.com'
rows=list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig')))
class Trace(urllib.request.HTTPRedirectHandler):
 def __init__(self):self.hops=[]
 def redirect_request(self,req,fp,code,msg,headers,newurl):self.hops.append({'status':code,'location':newurl});return super().redirect_request(req,fp,code,msg,headers,newurl)
def read(url):
 t=Trace();c=urllib.request.build_opener(t)
 try:
  r=c.open(url,timeout=30);body=r.read().decode('utf-8','replace');status=r.status;final=r.url
 except urllib.error.HTTPError as e:status=e.code;final=e.url;body=e.read().decode('utf-8','replace')
 except Exception as e:return {'url':url,'error':str(e),'hops':t.hops}
 try:
  d=html.fromstring(body);title=' '.join(d.xpath('//head/title/text()')).strip();h1=d.xpath('//h1//text()');canonical=d.xpath('//link[@rel="canonical"]/@href');robots=d.xpath('//meta[translate(@name,"ROBOTS","robots")="robots"]/@content');ids=d.xpath('//*[@id]/@id');ld=d.xpath('//script[@type="application/ld+json"]/text()')
 except Exception:title='';h1=[];canonical=[];robots=[];ids=[];ld=[]
 return {'url':url,'status':status,'final':final,'hops':t.hops,'title':title,'h1':h1,'canonical':canonical,'robots':robots,'fragment_ok':not urlsplit(url).fragment or urlsplit(url).fragment in ids,'liquid_error':'Liquid error' in body or 'Liquid syntax error'in body,'products_links':len(set(d.xpath('//main//a[contains(@href,"/products/")]/@href'))) if body and title else 0,'structured_data':ld}
urls=sorted({BASE+r['Redirect from']for r in rows}|{BASE+r['Redirect to']for r in rows})
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as ex:checks=dict(zip(urls,ex.map(read,urls)))
(ROOT/'redirect-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2));print('Shopify sources/destinations checked:',len(checks),flush=True)

# Bagy is intentionally not retried: the source pages returned Azion HTTP 403 on 17/11/2026.
