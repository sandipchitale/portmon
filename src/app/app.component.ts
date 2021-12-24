/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-console */
import * as electron from 'electron';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import { Component, NgZone, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SortEvent } from 'primeng/api';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit{
  public onlyPorts = '';
  public onlyPortsArray = [];
  public monitor = true;
  public listeningOnly = true;
  public wait = false;

  public updatedAt = new Date();

  public eportmonSettingsFilePath = path.join(os.homedir(), '.portmon.json');
  public eportmonSettings = {
    ports: '4200,8080,8765,2910'
  };

  intervalId: NodeJS.Timer;

  public ports = [];

  constructor(
    private ngzone: NgZone,
    private translate: TranslateService
  ) {
    this.translate.setDefaultLang('en');
  }

  ngOnInit() {
    this.loadSettings();
    this.startMonitoring();
  }

  public toggleMonitoring(event) {
    // first clear
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }
    this.monitor = !this.monitor;
    if (event.checked) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
  }
  public startMonitoring() {
    this.netstat();
    this.intervalId = setInterval(this.netstat, 10000);
    this.monitor = true;
  }

  public stopMonitoring() {
    this.monitor = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  // save settings
  public saveSettings() {
    fs.writeFileSync(this.eportmonSettingsFilePath, JSON.stringify(this.eportmonSettings, null, '  '));
  }

  // load settings
  public loadSettings() {
    if (this.isFile(this.eportmonSettingsFilePath)) {
      try {
        this.eportmonSettings = JSON.parse(fs.readFileSync(this.eportmonSettingsFilePath, 'base64'));
        } catch (e) {
        }
    } else {
        this.saveSettings();
    }
  };

  public customSort(event: SortEvent) {
    event.data.sort((data1, data2) => {
      const value1 = data1[event.field];
      const value2 = data2[event.field];
      let result = null;

      if (value1 == null && value2 != null) {
        result = -1;
      } else if (value1 != null && value2 == null) {
        result = 1;
      } else if (value1 == null && value2 == null) {
        result = 0;
      } else {
        if (event.field === 'local' || event.field === 'pid') {
          const value1Int = parseInt(value1, 10);
          const value2Int = parseInt(value2, 10);
          result = (value1Int < value2Int) ? -1 : (value1Int > value2Int) ? 1 : 0;
        } else {
          result = value1.localeCompare(value2);
        }
      }
      return (event.order * result);
    });
  }

  portsChanged(event) {
    if (event.keyCode === 13) {
      this.eportmonSettings.ports = this.onlyPorts;
      this.saveSettings();
      this.doNetstat();
    } else {
      this.netstat();
    }
  }

  filterPorts(portLine) {
    return (!this.listeningOnly || portLine[2] === 'LISTENING') &&
            (this.onlyPortsArray.length === 0 || this.onlyPortsArray.indexOf(portLine[1]) !== -1);
  }

  orderByPorts(portLine) {
    return parseInt(portLine[1], 10);
  }

  killProcess(event, PID) {
    if (typeof PID === 'string') {
      PID = parseInt(PID, 10);
    }
    if (typeof PID === 'number') {
      if (!event.ctrlKey && !window.confirm('Kill process: ' + PID)) {
        return;
      }

      this.ngzone.runOutsideAngular(async () => {
        child_process.exec((os.platform() === 'win32' ? `taskkill /F /PID ${PID}` : `kill -9 ${PID}`), async (err, stdout, stderr) => {
          if (err) {
            electron.dialog.showErrorBox(`Error`, `Failed to stop ${PID}`);
            return;
          }
          this.doNetstat();
        });
      });
    }
  }

  public netstat() {
    if (this.monitor) {
      this.doNetstat();
    }
  }

  public doNetstat() {
    const onlyPortsArray = this.onlyPorts.split(/,/)
      .filter((port) => port.trim().length > 0);

    this.wait = true;
    this.ngzone.runOutsideAngular(async () => {
      child_process.exec(`netstat -anop tcp`, async (err, stdout, stderr) => {
        if (err) {
          console.error(err);
          return;
        }
        this.ngzone.run(async () => {
          this.wait = false;
          this.updatedAt = new Date();
          this.ports = [];
          const portLinesArray = stdout.split(/\r?\n/)
            .filter((portline) => portline.trim().length > 0)
            .map((portline) => portline.trim())
            .filter((portline) => !portline.trim().startsWith('Active Connections'))
            .filter((portline) => !portline.trim().startsWith('Proto'));
          portLinesArray.forEach(portLine => {
            const portLineParts = portLine.split(/\s+/);
            const port = portLineParts[1].replace(/[^:]+:/, '');
            if (onlyPortsArray.length === 0 || onlyPortsArray.includes(port)) {
              if (!this.listeningOnly || portLineParts[3] === 'LISTENING') {
                this.ports.push(
                  {
                    protocol: portLineParts[0],
                    local: port,
                    status: portLineParts[3],
                    pid: portLineParts[4]
                  },
                );
              }
            }
          });
        });
      });
    });
  }

  // Utility
  isFile(p: string): boolean {
    try {
      return fs.statSync(p) && fs.statSync(p).isFile();
    } catch (e) {
      return false;
    }
  }

  isDirectory(p: string): boolean {
    try {
      return fs.statSync(p) && fs.statSync(p).isDirectory();
    } catch (e) {
      return false;
    }
  }

  public github() {
    electron.shell.openExternal('https://github.com/sandipchitale/portmon/');
  }

  public quit() {
    window.close();
  }
}
