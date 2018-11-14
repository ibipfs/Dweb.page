import MIME from 'mime/lite';
import 'fast-text-encoding';
import Iota from './log/Iota';
import Encryption from './services/Encryption';
import Ping from './services/Ping';
import GetGateway from './services/getGateway';
import Log from './log/Log';
import { saveAs } from './services/fileSaver';
import './search/autocomplete';

const gateway = GetGateway();
/**
 *
 * @param {string} msg
 */
function output(msg) {
  const m = document.getElementById('messages');
  m.innerHTML = msg;
}

function downloadFile(fileId, fileName, blob, isEncrypted) {
  const p = new Ping();
  p.ping((err) => {
    if (err) {
      output('Something is blocking the log entry!');
    }
    new Log().createLog(fileId, fileName, false, gateway, isEncrypted);
    window.history.replaceState(null, null, window.location.pathname);
    saveAs(blob, fileName);
  });
}

function progressBar(percent) {
  const elem = document.getElementById('loadBar');
  elem.style.width = `${percent}%`;
  if (percent >= 100) {
    document.getElementById('loadProgress').style.display = 'none';
  }
}

function compareTime(a, b) {
  const da = new Date(a.time).getTime();
  const db = new Date(b.time).getTime();
  if (da > db) return -1;
  if (da < db) return 1;
  return 0;
}

async function searchFileIdBasedOnName(fileInput) {
  const iota = new Iota();
  let fileIn = fileInput;
  if (fileIn.includes('.')) {
    const [firstPartOfInput] = fileInput.split('.');
    fileIn = firstPartOfInput;
  }
  const transactions = await iota.getTransactionByName(fileIn.trim());
  const results = [];
  if (typeof (transactions) !== 'undefined') {
    for (let i = 0; i < transactions.length; i += 1) {
      results.push(iota.getAddress(transactions[i]));
    }
    let transactionObjs = await Promise.all(results);
    // returns only the most recent uploaded version!
    transactionObjs = transactionObjs.sort(compareTime);
    return transactionObjs[0].fileId;
  }

  return 'wrongName';
}

async function load() {
  const passwordInput = document.getElementById('passwordField').value;
  let fileInput = document.getElementById('firstField').value;
  if (fileInput.length !== 46 && typeof fileInput !== 'undefined') {
    fileInput = await searchFileIdBasedOnName(fileInput);
  }
  if (fileInput === 'wrongName' || (passwordInput.length === 43 && fileInput.length !== 46)) {
    // unencrypted files can be downloaded by name instead of file id!
    output('You have entered an invalid filename!');
  } else if (passwordInput.length !== 43 && passwordInput !== '' && passwordInput !== 'nopass') {
    output('You have entered an invalid password!');
  } else if (!/^[a-zA-Z0-9_.-]*$/.test(passwordInput)) {
    output('You have entered an invalid password!');
  } else if (!/^[a-zA-Z0-9]*$/.test(fileInput)) {
    output('You have entered an invalid filename!');
  } else {
    output('');
    const oReq = new XMLHttpRequest();
    document.getElementById('receiveResponse').style.display = 'none';
    oReq.onloadstart = function onloadstart() {
      document.getElementById('loadProgress').style.display = 'block';
    };
    oReq.onload = async function onload() {
      const arrayBuffer = oReq.response;
      // encrypted
      if (passwordInput !== '' && passwordInput !== 'nopass') {
        const fileNameLength = new TextDecoder('utf-8').decode(arrayBuffer.slice(0, 4)) - 1000;
        const fileName = new TextDecoder('utf-8').decode(
          arrayBuffer.slice(4, fileNameLength + 4),
        );
        const initialVector = new Uint8Array(
          arrayBuffer.slice(4 + fileNameLength, 16 + fileNameLength),
        );
        const fileArray = new Uint8Array(
          arrayBuffer.slice(16 + fileNameLength),
        );
        const enc = new Encryption();
        const keyPromise = enc.importKey(passwordInput);
        keyPromise
          .then((key) => {
            const decryptPromise = enc.decrypt(initialVector, key, fileArray);
            decryptPromise
              .then((decrypted) => {
                const typeM = MIME.getType(fileName);
                const blob = new Blob([decrypted], { type: typeM });
                blob.name = fileName;
                downloadFile(fileInput, fileName, blob, true);
              })
              .catch(() => {
                output('You have entered an invalid password!');
              });
          })
          .catch(() => {
            output('You have entered an invalid password!');
          });
      } else {
        // not encrypted, get information from IOTA
        const iota = new Iota();
        const transactions = await iota.getTransaction(fileInput);
        const logObj = await iota.getLog(transactions[0]);
        const typeM = MIME.getType(logObj.fullFileName);
        const blob = new Blob([arrayBuffer], { type: typeM });
        blob.name = logObj.fullFileName;
        downloadFile(fileInput, logObj.fullFileName, blob, false);
      }
    };
    oReq.onprogress = function onprogress(e) {
      if (e.lengthComputable) {
        const per = Math.round((e.loaded * 100) / e.total);
        progressBar(per);
      }
    };
    oReq.onreadystatechange = function onreadystatechange() {
      // Ready State 4 = operation completed
      if (oReq.readyState === 4) {
        if (oReq.status !== 200) {
          output('You have entered an invalid filename!');
        }
      }
    };

    oReq.open('GET', gateway + fileInput, true);
    oReq.responseType = 'arraybuffer';
    oReq.send();
  }
}

document.getElementById('load').addEventListener('click', () => {
  load();
});
