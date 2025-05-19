import { ConfigurationSchema, configSchema } from 'config/configSchema';
import React, { Dispatch, SetStateAction } from 'react';
import { AppState, RecStatus } from 'main/types';
import { Info } from 'lucide-react';
import { getLocalePhrase, Phrase } from 'localisation/translations';
import { setConfigValues } from './useSettings';
import { pathSelect } from './rendererutils';
import Switch from './components/Switch/Switch';
import Label from './components/Label/Label';
import { Input } from './components/Input/Input';
import { Tooltip } from './components/Tooltip/Tooltip';
import TextBanner from './components/TextBanner/TextBanner';

interface IProps {
  recorderStatus: RecStatus;
  config: ConfigurationSchema;
  setConfig: Dispatch<SetStateAction<ConfigurationSchema>>;
  appState: AppState;
}

const ipc = window.electron.ipcRenderer;

const FlavourSettings: React.FC<IProps> = (props: IProps) => {
  const { recorderStatus, config, setConfig, appState } = props;
  const initialRender = React.useRef(true);

  React.useEffect(() => {
    // Don't fire on the initial render.
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }

    setConfigValues({
      recordFFXIV: config.recordFFXIV,
    });

    ipc.sendMessage('settingsChange', []);
  }, [config.recordFFXIV, config.xivLogPath]);

  const isComponentDisabled = () => {
    const isRecording = recorderStatus === RecStatus.Recording;
    const isOverrunning = recorderStatus === RecStatus.Overrunning;
    return isRecording || isOverrunning;
  };

  const getDisabledText = () => {
    if (!isComponentDisabled()) {
      return <></>;
    }

    return (
      <TextBanner>
        {getLocalePhrase(appState.language, Phrase.SettingsDisabledText)}
      </TextBanner>
    );
  };

  const getSwitch = (
    preference: keyof ConfigurationSchema,
    changeFn: (checked: boolean) => void,
  ) => (
    <Switch
      checked={Boolean(config[preference])}
      name={preference}
      onCheckedChange={changeFn}
    />
  );

  const setRecordFFXIV = (checked: boolean) => {
    setConfig((prevState) => {
      return {
        ...prevState,
        recordFFXIV: checked,
      };
    });
  };

  const setXIVLogPath = async () => {
    if (isComponentDisabled()) {
      return;
    }

    const newPath = await pathSelect();

    if (newPath === '') {
      return;
    }

    setConfig((prevState) => {
      return {
        ...prevState,
        xivLogPath: newPath,
      };
    });
  };

  const getXIVSettings = () => {
    if (isComponentDisabled()) {
      return <></>;
    }

    return (
      <div className="flex flex-row gap-x-6">
        <div className="flex flex-col w-[140px]">
          <Label htmlFor="recordRetailPtr" className="flex items-center">
            {getLocalePhrase(appState.language, Phrase.RecordFFXIVLabel)}
            <Tooltip
              content={getLocalePhrase(
                appState.language,
                configSchema.recordFFXIV.description,
              )}
              side="top"
            >
              <Info size={20} className="inline-flex ml-2" />
            </Tooltip>
          </Label>
          <div className="flex h-10 items-center">
            {getSwitch('recordFFXIV', setRecordFFXIV)}
          </div>
        </div>
        {config.recordFFXIV && (
          <div className="flex flex-col w-1/2">
            <Label htmlFor="xivLogPath" className="flex items-center">
              {getLocalePhrase(appState.language, Phrase.XIVLogPathLabel)}

              <Tooltip
                content={getLocalePhrase(
                  appState.language,

                  configSchema.classicLogPath.description,
                )}
                side="top"
              >
                <Info size={20} className="inline-flex ml-2" />
              </Tooltip>
            </Label>

            <Input
              value={config.xivLogPath}
              onClick={setXIVLogPath}
              readOnly
              required
            />

            {config.xivLogPath === '' && (
              <span className="text-error text-sm">
                {getLocalePhrase(
                  appState.language,

                  Phrase.InvalidFFXIVLogPath,
                )}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-y-8">
      {getDisabledText()}
      {getXIVSettings()}
    </div>
  );
};

export default FlavourSettings;
