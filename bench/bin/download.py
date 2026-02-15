import os
import sys
import argparse
import requests
import hashlib
import gzip
import zipfile
import shutil
from tqdm import tqdm


OUTPUT_DIR = os.path.join(os.path.dirname(
    os.path.abspath(__file__)), "../datasets/logs")
os.makedirs(OUTPUT_DIR, exist_ok=True)

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATASETS = [
    {
        "id": "01",
        "target_filename": "01 Data-Driven Process Discover - Artificial Event Log - 0 Noise.xes",
        "url": "https://data.4tu.nl/file/23717951-a397-4d5e-b9cd-a6a851be39cc/db0438d1-c3c5-41c7-bc74-fa11709b84cb",
        "md5": "6cdd00543041022607eff7c236b63091",
        "pipeline": [{"action": "unzip_extract", "src": "log-0-percent-noise.xes.gz"}, {"action": "ungzip"}]
    },
    {
        "id": "02",
        "target_filename": "02 Sepsis Cases - Event Log.xes",
        "url": "https://www.kaggle.com/api/v1/datasets/download/asjad99/sepsis-treatment-careflow",
        "md5": None,
        "pipeline": [{"action": "kaggle_download"}, {"action": "unzip_extract", "src": "Sepsis Cases - Event Log.xes"}]
    },
    {
        "id": "03",
        "target_filename": "03 BPI Challenge 2020 - Request For Payment.xes",
        "url": "https://data.4tu.nl/file/a6f651a7-5ce0-4bc6-8be1-a7747effa1cc/7b1f2e56-e4a8-43ee-9a09-6e64f45a1a98",
        "md5": "2eb4dd20e70b8de4e32cc3c239bde7f2",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "04",
        "target_filename": "04 BPI Challenge 2013 - Incidents.xes",
        "url": "https://data.4tu.nl/file/0fc5c579-e544-4fab-9143-fab1f5192432/aa51ffbb-25fd-4b5a-b0b8-9aba659b7e8c",
        "md5": "d4809bd55e3e1c15b017ab4e58228297",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "05",
        "target_filename": "05 Synthetic Event Logs - Review Example Large.xes",
        "url": "https://data.4tu.nl/file/fd934763-2996-47a8-8185-542bfb235036/faf49cb6-efa7-4765-adac-00a33324aa5f",
        "md5": "69a38c8065da24b31e5d431b5d4e1f23",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "06",
        "target_filename": "06 BPI Challenge 2012.xes",
        "url": "https://data.4tu.nl/file/533f66a4-8911-4ac7-8612-1235d65d1f37/3276db7f-8bee-4f2b-88ee-92dbffb5a893",
        "md5": "74c7ba9aba85bfcb181a22c9d565e5b5",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "07",
        "target_filename": "07 BPI Challenge 2017 - Offer Log.xes",
        "url": "https://data.4tu.nl/file/cc497753-1175-41f6-a107-425787c54266/9d3ba048-b811-46c0-af62-63d72769a453",
        "md5": "130221de81e95f95581f2ec2e37a4aca",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "08",
        "target_filename": "08 Hospital Billing - Event Log.xes",
        "url": "https://data.4tu.nl/file/6af6d5f0-f44c-49be-aac8-8eaa5fe4f6fd/28b83e72-375e-4da4-8459-a8506e898edf",
        "md5": "2784619352be170e01c0a65594539972",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "09",
        "target_filename": "09 Large Bank Transaction Process - All Without Noise.xes",
        "url": "https://data.4tu.nl/file/2eaae5ea-f43c-4630-8082-9ba1cf386b22/d5f1bea9-e970-4625-9106-ad4c8c9a309e",
        "md5": "6641bc77a3286ac5351f8da5140f2bc2",
        "cleanup_dir": "banktransfer",
        "pipeline": [
            {"action": "unzip_extract",
                "src": "banktransfer/logs/10000-all-nonoise.xes.zip"},
            {"action": "unzip_first"}
        ]
    },
    {
        "id": "10",
        "target_filename": "10 Road Traffic Fine Management Process.xes",
        "url": "https://data.4tu.nl/file/806acd1a-2bf2-4e39-be21-69b8cad10909/b234b06c-4d4f-4055-9f14-6218e3906d82",
        "md5": "dc4cae9a592938af92932ca6c043baeb",
        "pipeline": [{"action": "ungzip"}]
    },
    {
        "id": "11",
        "target_filename": "11 BPI Challenge 2019.xes",
        "url": "https://data.4tu.nl/file/35ed7122-966a-484e-a0e1-749b64e3366d/864493d1-3a58-47f6-ad6f-27f95f995828",
        "md5": "4eb909242351193a61e1c15b9c3cc814",
        "pipeline": [{"action": "direct"}]
    }
]


def calculate_md5(file_path):
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


def download_file(url, temp_path, auth=None):
    print(f"Downloading: {url}...")
    try:
        with requests.get(url, stream=True, auth=auth) as r:
            if r.status_code == 401 or r.status_code == 403:
                raise PermissionError(
                    "Authentication failed. Check --kaggle-username and --kaggle-key.")
            r.raise_for_status()
            total_size = int(r.headers.get('content-length', 0))
            with open(temp_path, 'wb') as f, tqdm(total=total_size, unit='B', unit_scale=True) as bar:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
                    bar.update(len(chunk))
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise e


def run_pipeline(ds, kaggle_auth=None):
    final_path = os.path.join(OUTPUT_DIR, ds['target_filename'])

    if os.path.exists(final_path):
        print(f"Found: {ds['target_filename']}")
        return

    print(f"\nProcessing #{ds['id']}: {ds['target_filename']}")
    temp_dl = os.path.join(OUTPUT_DIR, f"temp_dl_{ds['id']}")

    try:
        if ds['pipeline'][0]['action'] == 'kaggle_download':
            if not kaggle_auth:
                print(
                    "Skipping Kaggle dataset (no --kaggle-username / --kaggle-key provided).")
                return
            elif not os.path.exists(temp_dl):
                download_file(ds['url'], temp_dl, auth=kaggle_auth)

        else:
            download_file(ds['url'], temp_dl)
            if ds.get('md5'):
                print("Verifying MD5...")
                if calculate_md5(temp_dl) != ds['md5']:
                    print("MD5 mismatch!")
                    os.remove(temp_dl)
                    return
                print("MD5 verified!")

        current_file = temp_dl
        start_index = 1 if ds['pipeline'][0]['action'] == 'kaggle_download' else 0

        for step in ds['pipeline'][start_index:]:
            action = step['action']

            if action == 'direct':
                pass

            elif action == 'ungzip':
                out_name = final_path if step == ds['pipeline'][-1] else current_file.replace(
                    '.gz', '')
                print(f"Decompressing GZ...")
                with gzip.open(current_file, 'rb') as f_in, open(out_name, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
                if os.path.exists(current_file):
                    os.remove(current_file)
                current_file = out_name

            elif action == 'unzip_extract':
                target_src = step['src']
                print(f"Extracting '{target_src}'...")
                with zipfile.ZipFile(current_file, 'r') as z:
                    z.extract(target_src, OUTPUT_DIR)
                extracted_path = os.path.join(OUTPUT_DIR, target_src)
                if os.path.exists(current_file):
                    os.remove(current_file)
                current_file = extracted_path

            elif action == 'unzip_first':
                print("Extracting from nested Zip...")
                with zipfile.ZipFile(current_file, 'r') as z:
                    xes = [f for f in z.namelist() if f.endswith('.xes')][0]
                    z.extract(xes, OUTPUT_DIR)
                extracted_path = os.path.join(OUTPUT_DIR, xes)
                if os.path.exists(current_file):
                    os.remove(current_file)
                current_file = extracted_path

        if current_file != final_path and os.path.exists(current_file):
            if os.path.exists(final_path):
                os.remove(final_path)
            os.rename(current_file, final_path)

        if 'cleanup_dir' in ds:
            dir_to_clean = os.path.join(OUTPUT_DIR, ds['cleanup_dir'])
            if os.path.exists(dir_to_clean):
                print(f"Cleaning up folder: {ds['cleanup_dir']}")
                shutil.rmtree(dir_to_clean)

        if os.path.exists(temp_dl):
            os.remove(temp_dl)
        print(f"Ready: {ds['target_filename']}")

    except Exception as e:
        print(f"Error processing {ds['id']}: {e}")
        if os.path.exists(temp_dl):
            os.remove(temp_dl)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Download benchmark datasets")
    parser.add_argument("--kaggle-username", help="Kaggle username")
    parser.add_argument("--kaggle-key", help="Kaggle API key")
    args = parser.parse_args()

    kaggle_auth = (
        args.kaggle_username, args.kaggle_key) if args.kaggle_username and args.kaggle_key else None

    print("Processing datasets...")
    for ds in DATASETS:
        run_pipeline(ds, kaggle_auth=kaggle_auth)
    print("\nAll datasets processed.")
