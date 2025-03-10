import requests
import io
import json
import logging
import mimetypes
import os
import time
import aiohttp
import openai

from typing import AsyncGenerator
from os.path import join, dirname
from quart_cors import cors
from dotenv import load_dotenv
from azure.identity.aio import DefaultAzureCredential
from azure.core.credentials import AzureKeyCredential
from azure.monitor.opentelemetry import configure_azure_monitor
from azure.search.documents.aio import SearchClient
from azure.storage.blob.aio import BlobServiceClient
from opentelemetry.instrumentation.aiohttp_client import AioHttpClientInstrumentor
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from quart import (
    Blueprint,
    Quart,
    abort,
    current_app,
    jsonify,
    make_response,
    request,
    send_file,
    send_from_directory,
)
from sql.Log import Log
from approaches.chatreadretrieveread import ChatReadRetrieveReadApproach
from approaches.readdecomposeask import ReadDecomposeAsk
from approaches.readretrieveread import ReadRetrieveReadApproach
from approaches.retrievethenread import RetrieveThenReadApproach


request_origin = ""
env = os.environ.get('ENV', "development")
if env == "production":
    dotenv_path = join(dirname(__file__), '.env.prod')
    request_origin = "https://oeps-chat-app.azurewebsites.net"
    print("dotenvpath:",dotenv_path)
    load_dotenv(dotenv_path)
elif env == "v3development":
    dotenv_path = join(dirname(__file__), '.env.dev.v3')
    request_origin = "https://oeps-chat.azurewebsites.net"
    print("dotenvpath:",dotenv_path)
    load_dotenv(dotenv_path)
else:
    dotenv_path = join(dirname(__file__), '.env.dev')
    request_origin = "https://oeps-chat-v4.azurewebsites.net/"
    print("dotenvpath:",dotenv_path)
    load_dotenv(dotenv_path)

CONFIG_OPENAI_TOKEN = "openai_token"
CONFIG_CREDENTIAL = "azure_credential"
CONFIG_ASK_APPROACHES = "ask_approaches"
CONFIG_CHAT_APPROACHES = "chat_approaches"
CONFIG_BLOB_CONTAINER_CLIENT = "blob_container_client"

bp = Blueprint("routes", __name__, static_folder="static")


def getUsername(cookie_value):
    print("getUsername:")
    current_app.logger.info("getUsername")
    try:
        cookies = {'AppServiceAuthSession': cookie_value,'path':"/"}
        url = "{}/.auth/me".format(request_origin)
        # url = "{}/.auth/me".format("https://oeps-chat.azurewebsites.net")
        current_app.logger.info("url:"+str(url))
        print("url:",url)
        response = requests.get(url,cookies=cookies,timeout=3)
        current_app.logger.info(cookies)
        current_app.logger.info(response)
        result = response.json()
        username = result[0]['user_id']
        current_app.logger.info("username:"+str(username))
        print("username:",username)
        return username
    except Exception as e:
        current_app.logger.info("Exception in get username")
        current_app.logger.info(e)
        print("Exception in get username",e)
    finally:
        current_app.logger.info("finally")
        print("finally")
    return ""
            

@bp.route("/")
async def index():
    return await bp.send_static_file("index.html")


@bp.route("/favicon.ico")
async def favicon():
    return await bp.send_static_file("favicon.ico")

@bp.route("/aisal.png")
async def logo():
    return await bp.send_static_file("aisal.png")

@bp.route("/wft-icon.png")
async def wfticon():
    return await bp.send_static_file("wft-icon.png")


@bp.route("/assets/<path:path>")
async def assets(path):
    return await send_from_directory("static/assets", path)


# Serve content files from blob storage from within the app to keep the example self-contained.
# *** NOTE *** this assumes that the content files are public, or at least that all users of the app
# can access all the files. This is also slow and memory hungry.
@bp.route("/content/<path>")
async def content_file(path):
    blob_container_client = current_app.config[CONFIG_BLOB_CONTAINER_CLIENT]
    blob = await blob_container_client.get_blob_client(path).download_blob()
    if not blob.properties or not blob.properties.has_key("content_settings"):
        abort(404)
    mime_type = blob.properties["content_settings"]["content_type"]
    if mime_type == "application/octet-stream":
        mime_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    blob_file = io.BytesIO()
    await blob.readinto(blob_file)
    blob_file.seek(0)
    return await send_file(blob_file, mimetype=mime_type, as_attachment=False, attachment_filename=path)


@bp.route("/ask", methods=["POST"])
async def ask():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()
    approach = request_json["approach"]
    try:
        impl = current_app.config[CONFIG_ASK_APPROACHES].get(approach)
        if not impl:
            return jsonify({"error": "unknown approach"}), 400
        # Workaround for: https://github.com/openai/openai-python/issues/371
        async with aiohttp.ClientSession() as s:
            openai.aiosession.set(s)
            r = await impl.run(request_json["question"], request_json.get("overrides") or {})
        return jsonify(r)
    except Exception as e:
        logging.exception("Exception in /ask")
        return jsonify({"error": str(e)}), 500

@bp.route("/update", methods=["POST"])
async def update():
    try:
        logObj = Log()
        if not request.is_json:
            return jsonify({"error": "request must be json"}), 415
        request_json = await request.get_json()
        logObj.updateIsLike(request_json["isLike"],request_json["id"],request_json["comment"])
        return jsonify({"status":"OK"}),200
    except Exception as e:
        logging.exception("Exception in /update")
        return jsonify({"error": str(e)}), 500

@bp.route("/chat", methods=["POST"])
async def chat():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()
    approach = request_json["approach"]
    try:
        impl = current_app.config[CONFIG_CHAT_APPROACHES].get(approach)
        if not impl:
            return jsonify({"error": "unknown approach"}), 400
        # Workaround for: https://github.com/openai/openai-python/issues/371
        async with aiohttp.ClientSession() as s:
            openai.aiosession.set(s)
            r = await impl.run_without_streaming(request_json["history"], request_json.get("overrides", {}))
        return jsonify(r)
    except Exception as e:
        logging.exception("Exception in /chat")
        return jsonify({"error": str(e)}), 500


async def format_as_ndjson(r: AsyncGenerator[dict, None]) -> AsyncGenerator[str, None]:
    async for event in r:
        yield json.dumps(event, ensure_ascii=False) + "\n"


@bp.route("/chat_stream", methods=["POST"])
async def chat_stream():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()
    approach = request_json["approach"]
    username = request_json["username"]
    host = request.host
    origin = ""
    if "localhost" in host:
        origin = host
    elif "jde-chat-v4" in host:
        origin = "(V4) "+host
    
    
    # cookie_value = request.cookies.get('AppServiceAuthSession')
    # username = getUsername(cookie_value)
    current_app.logger.info("username:"+str(username))
    current_app.logger.info("origin:"+str(origin))
    
    try:
        impl = current_app.config[CONFIG_CHAT_APPROACHES].get(approach)
        if not impl:
            return jsonify({"error": "unknown approach"}), 400
        response_generator = impl.run_with_streaming(request_json["history"], request_json.get("overrides", {}), username,origin)
        response = await make_response(format_as_ndjson(response_generator))
        response.timeout = None  # type: ignore
        return response
    except Exception as e:
        logging.exception("Exception in /chat")
        return jsonify({"error": str(e)}), 500


@bp.before_request
async def ensure_openai_token():
    if openai.api_type != "azure":
        return
    # openai_token = current_app.config[CONFIG_OPENAI_TOKEN]
    # if openai_token.expires_on < time.time() + 60:
    #     openai_token = await current_app.config[CONFIG_CREDENTIAL].get_token(
    #         "https://cognitiveservices.azure.com/.default"
    #     )
    current_app.config[CONFIG_OPENAI_TOKEN] = os.getenv("AZURE_OPENAI_SERVICE_KEY")
    openai.api_key = os.getenv("AZURE_OPENAI_SERVICE_KEY")


@bp.before_app_serving
async def setup_clients():
    # Replace these with your own values, either in environment variables or directly here
    AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT")
    AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER")
    AZURE_SEARCH_SERVICE = os.getenv("AZURE_SEARCH_SERVICE")
    AZURE_SEARCH_INDEX = os.getenv("AZURE_SEARCH_INDEX")
    # Shared by all OpenAI deployments
    OPENAI_HOST = os.getenv("OPENAI_HOST")
    OPENAI_CHATGPT_MODEL = os.getenv("AZURE_OPENAI_CHATGPT_MODEL")
    OPENAI_EMB_MODEL = os.getenv("AZURE_OPENAI_EMB_MODEL_NAME", "text-embedding-ada-002")
    # Used with Azure OpenAI deployments
    AZURE_OPENAI_SERVICE = os.getenv("AZURE_OPENAI_SERVICE")
    AZURE_OPENAI_CHATGPT_DEPLOYMENT = os.getenv("AZURE_OPENAI_CHATGPT_DEPLOYMENT")
    AZURE_OPENAI_EMB_DEPLOYMENT = os.getenv("AZURE_OPENAI_EMB_DEPLOYMENT")
    # Used only with non-Azure OpenAI deployments
    OPENAI_API_KEY = os.getenv("AZURE_OPENAI_SERVICE_KEY")
    OPENAI_ORGANIZATION = os.getenv("OPENAI_ORGANIZATION")

    KB_FIELDS_CONTENT = os.getenv("KB_FIELDS_CONTENT", "content")
    KB_FIELDS_SOURCEPAGE = os.getenv("KB_FIELDS_SOURCEPAGE", "metadata_storage_name")
    AZURE_SEARCH_SERVICE_KEY = os.getenv("AZURE_SEARCH_SERVICE_KEY")    

    # Use the current user identity to authenticate with Azure OpenAI, Cognitive Search and Blob Storage (no secrets needed,
    # just use 'az login' locally, and managed identity when deployed on Azure). If you need to use keys, use separate AzureKeyCredential instances with the
    # keys for each service
    # If you encounter a blocking error during a DefaultAzureCredential resolution, you can exclude the problematic credential by using a parameter (ex. exclude_shared_token_cache_credential=True)
    azure_credential = DefaultAzureCredential(exclude_shared_token_cache_credential=True)
    credential = AzureKeyCredential(AZURE_SEARCH_SERVICE_KEY)
    # Set up clients for Cognitive Search and Storage
    search_client = SearchClient(
        endpoint=f"https://{AZURE_SEARCH_SERVICE}.search.windows.net",
        index_name=AZURE_SEARCH_INDEX,
        credential=credential,
    )
    blob_client = BlobServiceClient(
        account_url=f"https://{AZURE_STORAGE_ACCOUNT}.blob.core.windows.net", credential=azure_credential
    )
    blob_container_client = blob_client.get_container_client(AZURE_STORAGE_CONTAINER)

    # Used by the OpenAI SDK
    if OPENAI_HOST == "azure":
        openai.api_type = "azure"
        openai.api_base = f"https://{AZURE_OPENAI_SERVICE}.openai.azure.com"
        openai.api_version = "2023-05-15"
        openai.api_key = os.getenv("AZURE_OPENAI_SERVICE_KEY")
        # Store on app.config for later use inside requests
        current_app.config[CONFIG_OPENAI_TOKEN] = os.getenv("AZURE_OPENAI_SERVICE_KEY")
    else:
        openai.api_type = "openai"
        openai.api_key = os.getenv("AZURE_OPENAI_SERVICE_KEY")
        openai.organization = OPENAI_ORGANIZATION

    current_app.config[CONFIG_CREDENTIAL] = azure_credential
    current_app.config[CONFIG_BLOB_CONTAINER_CLIENT] = blob_container_client

    # Various approaches to integrate GPT and external knowledge, most applications will use a single one of these patterns
    # or some derivative, here we include several for exploration purposes
    current_app.config[CONFIG_ASK_APPROACHES] = {
        "rtr": RetrieveThenReadApproach(
            search_client,
            OPENAI_HOST,
            AZURE_OPENAI_CHATGPT_DEPLOYMENT,
            OPENAI_CHATGPT_MODEL,
            AZURE_OPENAI_EMB_DEPLOYMENT,
            OPENAI_EMB_MODEL,
            KB_FIELDS_SOURCEPAGE,
            KB_FIELDS_CONTENT,
        ),
        "rrr": ReadRetrieveReadApproach(
            search_client,
            OPENAI_HOST,
            AZURE_OPENAI_CHATGPT_DEPLOYMENT,
            OPENAI_CHATGPT_MODEL,
            AZURE_OPENAI_EMB_DEPLOYMENT,
            OPENAI_EMB_MODEL,
            KB_FIELDS_SOURCEPAGE,
            KB_FIELDS_CONTENT,
        ),
        "rda": ReadDecomposeAsk(
            search_client,
            OPENAI_HOST,
            AZURE_OPENAI_CHATGPT_DEPLOYMENT,
            OPENAI_CHATGPT_MODEL,
            AZURE_OPENAI_EMB_DEPLOYMENT,
            OPENAI_EMB_MODEL,
            KB_FIELDS_SOURCEPAGE,
            KB_FIELDS_CONTENT,
        ),
    }
    current_app.config[CONFIG_CHAT_APPROACHES] = {
        "rrr": ChatReadRetrieveReadApproach(
            search_client,
            OPENAI_HOST,
            AZURE_OPENAI_CHATGPT_DEPLOYMENT,
            OPENAI_CHATGPT_MODEL,
            AZURE_OPENAI_EMB_DEPLOYMENT,
            OPENAI_EMB_MODEL,
            KB_FIELDS_SOURCEPAGE,
            KB_FIELDS_CONTENT,
        )
    }


def create_app():
    if os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING"):
        configure_azure_monitor()
        AioHttpClientInstrumentor().instrument()
    app = Quart(__name__)
    app = cors(app, allow_origin="http://localhost:5173")
    app.register_blueprint(bp)
    app.asgi_app = OpenTelemetryMiddleware(app.asgi_app)
    logging.basicConfig(level=logging.DEBUG)
    # Level should be one of https://docs.python.org/3/library/logging.html#logging-levels
    
    return app
