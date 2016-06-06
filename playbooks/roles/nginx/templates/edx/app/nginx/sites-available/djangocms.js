#
# {{ ansible_managed }}
#


{% if "avacms" in nginx_default_sites %}
  {% set default_site = "default" %}
{% else %}
  {% set default_site = "" %}
{% endif %}

upstream avacms_app_server {
{% for host in nginx_avacms_gunicorn_hosts %}
    server {{ host }}:{{ avacms_gunicorn_port }} fail_timeout=0;
{% endfor %}
}

server {
  server_name {{ AVACMS_HOSTNAME }};

  listen {{ AVACMS_NGINX_PORT }} {{ default_site }};

  {% if NGINX_ENABLE_SSL %}

  listen {{ ECOMMERCE_SSL_NGINX_PORT }} ssl;

  ssl_certificate /etc/ssl/certs/{{ NGINX_SSL_CERTIFICATE|basename }};
  ssl_certificate_key /etc/ssl/private/{{ NGINX_SSL_KEY|basename }};
  # request the browser to use SSL for all connections
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
  {% endif %}

  # Prevent invalid display courseware in IE 10+ with high privacy settings
  add_header P3P '{{ NGINX_P3P_MESSAGE }}';

  # Nginx does not support nested condition or or conditions so
  # there is an unfortunate mix of conditonals here.
  {% if NGINX_REDIRECT_TO_HTTPS %}
     {% if NGINX_HTTPS_REDIRECT_STRATEGY == "scheme" %}
  # Redirect http to https over single instance
  if ($scheme != "https") 
  { 
   set $do_redirect_to_https "true";
  }

     {% elif NGINX_HTTPS_REDIRECT_STRATEGY == "forward_for_proto" %}
  # Forward to HTTPS if we're an HTTP request... and the server is behind ELB 
  if ($http_x_forwarded_proto = "http") 
  {
   set $do_redirect_to_https "true";
  }
     {% endif %}
  # Execute the actual redirect
  if ($do_redirect_to_https = "true")
  {
  return 301 https://$host$request_uri;
  }
  {% endif %}

  location ~ ^/static/(?P<file>.*) {
    root {{ COMMON_DATA_DIR }}/{{ ecommerce_service_name }};
    try_files /staticfiles/$file =404;
  }

  location / {
    {% if AVACMS_ENABLE_BASIC_AUTH|bool %}
      {% include "basic-auth.j2" %}
    {% endif %}
    try_files $uri @proxy_to_app;
  }

  {% include "robots.j2" %}

location @proxy_to_app {
    {% if NGINX_SET_X_FORWARDED_HEADERS %}
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Port $server_port;
    proxy_set_header X-Forwarded-For $remote_addr;
    {% else %}
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-Port $http_x_forwarded_port;
    proxy_set_header X-Forwarded-For $http_x_forwarded_for;
    {% endif %}
    proxy_set_header Host $http_host;

    proxy_redirect off;
    proxy_pass http://avacms_app_server;
  }

}

