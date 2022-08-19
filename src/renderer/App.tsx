import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import React, { Component, useCallback, useState } from 'react';
import 'antd/dist/antd.css';
import { LockOutlined } from '@ant-design/icons';
import {
  Layout,
  Menu,
  Button,
  PageHeader,
  Descriptions,
  MenuProps,
  Divider,
  Row,
  Col,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Switch,
} from 'antd';
import { useEvent } from 'react-use';

import './App.css';

const { RangePicker } = DatePicker;
const { Sider } = Layout;
const { ipcRenderer } = window.electron;

class Main extends Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = {
      lockList: [],
      lockData: {
        lockMac: '',
        modelNum: '',
        hardwareVer: '',
        firmwareVer: '',
        settingMode: '',
        battery: '',
        rssi: '',
      },
    };

    ipcRenderer.on('foundDevice', (lockData: object) => {
      this.setState({
        lockList: [
          ...this.state.lockList,
          {
            key: this.state.lockList.length + 1,
            icon: React.createElement(LockOutlined),
            label: lockData.lockMac,
            data: lockData,
          },
        ],
      });
    });
  }

  onClick: MenuProps['onClick'] = (e) => {
    const {
      data: {
        lockMac,
        modelNum,
        hardwareVer,
        firmwareVer,
        settingMode,
        battery,
        rssi,
      },
    } = this.state.lockList.find(({ key }) => key == e.key);
    ipcRenderer.sendMessage('selectDevice', lockMac);
    this.setState({
      lockData: {
        lockMac,
        modelNum,
        hardwareVer,
        firmwareVer,
        settingMode,
        battery,
        rssi,
      },
    });
  };

  render() {
    return (
      <Layout hasSider>
        <Sider
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button
              type="primary"
              className="logo"
              onClick={() => {
                this.setState({
                  lockList: [],
                  lockData: {
                    lockMac: '',
                    modelNum: '',
                    hardwareVer: '',
                    firmwareVer: '',
                    settingMode: '',
                    battery: '',
                    rssi: '',
                  },
                });
                ipcRenderer.sendMessage('refresh');
              }}
            >
              Refresh
            </Button>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            items={this.state.lockList}
            onClick={this.onClick}
          />
        </Sider>
        <Layout
          className="site-layout"
          style={{
            marginLeft: 200,
            height: '100hv',
          }}
        >
          <PageHeader
            ghost={false}
            onBack={() => window.history.back()}
            title={this.state.lockData.lockMac}
            extra={[
              // <Button key="2" type="primary">
              //   Primary
              // </Button>,
              <div style={{ height: 40 }} />,
            ]}
          >
            <Descriptions size="small" column={3}>
              <Descriptions.Item label="ModelNum">
                {this.state.lockData.modelNum}
              </Descriptions.Item>
              <Descriptions.Item label="hardwareVer">
                {this.state.lockData.hardwareVer}
              </Descriptions.Item>
              <Descriptions.Item label="firmwareVer">
                {this.state.lockData.firmwareVer}
              </Descriptions.Item>
              <Descriptions.Item label="battery">
                {this.state.lockData.battery}
              </Descriptions.Item>
              <Descriptions.Item label="rssi">
                {this.state.lockData.rssi}
              </Descriptions.Item>
              <Descriptions.Item label="settingMode">
                {this.state.lockData.settingMode?.toString()}
              </Descriptions.Item>
            </Descriptions>
          </PageHeader>
          {this.state.lockData.lockMac !== '' && <Operations />}
        </Layout>
      </Layout>
    );
  }
}

// const Main0 = () => {
//   const [state, setState] = useState([]);
//
//   const lockData = {
//     lockMac: '',
//     modelNum: '',
//     hardwareVer: '',
//     firmwareVer: '',
//     settingMode: '',
//     battery: '',
//     rssi: '',
//   };
//   const [lockDataState, setLockDataState] = useState(lockData);
//
//   window.electron.ipcRenderer.on('foundDevice', (lockData: object) => {
//     setState([
//       ...state,
//       {
//         key: state.length + 1,
//         icon: React.createElement(LockOutlined),
//         label: lockData.lockMac,
//         data: lockData,
//       },
//     ]);
//   });
//
//   window.electron.ipcRenderer.on('readLockTimeRes', (res: object) => {
//     console.log('res', res);
//   });
//
//   const onClick: MenuProps['onClick'] = (e) => {
//     const {
//       data: {
//         lockMac,
//         modelNum,
//         hardwareVer,
//         firmwareVer,
//         settingMode,
//         battery,
//         rssi,
//       },
//     } = state.find(({ key }) => key == e.key);
//     window.electron.ipcRenderer.sendMessage('selectDevice', lockMac);
//     setLockDataState({
//       lockMac,
//       modelNum,
//       hardwareVer,
//       firmwareVer,
//       settingMode,
//       battery,
//       rssi,
//     });
//   };
//
//   return (
//     <Layout hasSider>
//       <Sider
//         style={{
//           overflow: 'auto',
//           height: '100vh',
//           position: 'fixed',
//           left: 0,
//           top: 0,
//           bottom: 0,
//         }}
//       >
//         <div style={{ display: 'flex', justifyContent: 'center' }}>
//           <Button
//             type="primary"
//             className="logo"
//             onClick={() => {
//               setState([]);
//               setLockDataState({
//                 lockMac: '',
//                 modelNum: '',
//                 hardwareVer: '',
//                 firmwareVer: '',
//                 settingMode: '',
//                 battery: '',
//                 rssi: '',
//               });
//               window.electron.ipcRenderer.sendMessage('refresh');
//             }}
//           >
//             Refresh
//           </Button>
//         </div>
//         <Menu
//           theme="dark"
//           mode="inline"
//           items={state}
//           onClick={onClick}
//         />
//       </Sider>
//       <Layout
//         className="site-layout"
//         style={{
//           marginLeft: 200,
//           height: '100hv',
//         }}
//       >
//         <PageHeader
//           ghost={false}
//           onBack={() => window.history.back()}
//           title={lockDataState.lockMac}
//           extra={[
//             // <Button key="2" type="primary">
//             //   Primary
//             // </Button>,
//             <div style={{ height: 40 }} />,
//           ]}
//         >
//           <Descriptions size="small" column={3}>
//             <Descriptions.Item label="ModelNum">
//               {lockDataState.modelNum}
//             </Descriptions.Item>
//             <Descriptions.Item label="hardwareVer">
//               {lockDataState.hardwareVer}
//             </Descriptions.Item>
//             <Descriptions.Item label="firmwareVer">
//               {lockDataState.firmwareVer}
//             </Descriptions.Item>
//             <Descriptions.Item label="battery">
//               {lockDataState.battery}
//             </Descriptions.Item>
//             <Descriptions.Item label="rssi">
//               {lockDataState.rssi}
//             </Descriptions.Item>
//             <Descriptions.Item label="settingMode">
//               {lockDataState.settingMode?.toString()}
//             </Descriptions.Item>
//           </Descriptions>
//         </PageHeader>
//         {lockDataState.lockMac !== '' && <Operations />}
//       </Layout>
//     </Layout>
//   );
// };

const CustomButton = ({ func, children }) => {
  const [isModalVisible, setModalVisible] = useState(false);
  const [res, setRes] = useState('');
  const [isLoading, setLoading] = useState(false);

  const handleEvent = useCallback((res: object) => {
    setRes(JSON.stringify(res));
    setLoading(false);
    setModalVisible(true);
  }, []);
  useEvent(`${func}Res`, handleEvent, ipcRenderer);

  return (
    <>
      <Modal
        title="Basic Modal"
        visible={isModalVisible}
        onOk={() => setModalVisible(false)}
        cancelButtonProps={{ disabled: true }}
      >
        <p>{res}</p>
      </Modal>
      <Button
        type="primary"
        block
        loading={isLoading}
        onClick={() => {
          setLoading(true);
          ipcRenderer.sendMessage(func);
        }}
      >
        {children}
      </Button>
    </>
  );
};

const AddCyclicCodeButton = ({ children }) => {
  const [isModalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [days, setDays] = useState([
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  const [access, setAccess] = useState('normal');
  const [res, setRes] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [isResModalVisible, setResModalVisible] = useState('');

  const handleEvent = useCallback((res: object) => {
    setRes(JSON.stringify(res));
    setLoading(false);
    setResModalVisible(true);
  }, []);
  useEvent(`addCyclicPasscodeRes`, handleEvent, ipcRenderer);

  return (
    <>
      <Modal
        title="Add Cyclic Code"
        visible={isModalVisible}
        onOk={() => {
          setModalVisible(false);
          setLoading(true);
          const [startDate, startTime] = startDateTime.split(' ');
          const [endDate, endTime] = endDateTime.split(' ');
          const level = ['normal', 'privileged', 'admin'].indexOf(access);
          ipcRenderer.sendMessage('addCyclicPasscode', {
            name,
            code,
            startTime,
            endTime,
            startDate,
            endDate,
            days,
            level,
          });
        }}
        onCancel={() => setModalVisible(false)}
      >
        <Form
          name="basic"
          labelCol={{ span: 8 }}
          wrapperCol={{ span: 16 }}
          initialValues={{ remember: true }}
          autoComplete="off"
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ message: 'type code name' }]}
          >
            <Input onChange={(event) => setName(event.target.value)} />
          </Form.Item>

          <Form.Item
            label="Code"
            name="code"
            rules={[{ required: true, message: 'type your code' }]}
          >
            <Input onChange={(event) => setCode(event.target.value)} />
          </Form.Item>

          <Form.Item label="Date Time" name="dateTime">
            <RangePicker
              showTime
              onOk={(arr) => {
                setStartDateTime(arr[0]?.format('YYYY-MM-DD HH:mm:ss'));
                setEndDateTime(arr[1]?.format('YYYY-MM-DD HH:mm:ss'));
              }}
            />
          </Form.Item>

          <Form.Item label="Cyclic Days" name="days">
            <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Sun</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[0] = checked;
                setDays(arr);
              }}
            />
            <span>Mon</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[1] = checked;
                setDays(arr);
              }}
            />
            <span>Tue</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[2] = checked;
                setDays(arr);
              }}
            />
            <span>Wed</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[3] = checked;
                setDays(arr);
              }}
            />
            <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Thu</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[4] = checked;
                setDays(arr);
              }}
            />
            <span>Fri</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[5] = checked;
                setDays(arr);
              }}
            />
            <span>Sat</span>
            <Switch
              style={{ margin: '0.5em' }}
              size="small"
              onChange={(checked) => {
                const arr = [...days];
                arr[6] = checked;
                setDays(arr);
              }}
            />
          </Form.Item>

          <Form.Item label="Access" name="access">
            <Select
              defaultValue="normal"
              style={{ width: 120 }}
              onChange={(value: string) => setAccess(value)}
            >
              <Option value="normal">Normal</Option>
              <Option value="privileged">Privileged</Option>
              <Option value="admin">Admin</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Basic Modal"
        visible={isResModalVisible}
        onOk={() => setResModalVisible(false)}
        cancelButtonProps={{ disabled: true }}
      >
        <p>{res}</p>
      </Modal>
      <Button
        type="primary"
        block
        loading={isLoading}
        onClick={() => {
          setModalVisible(true);
        }}
      >
        {children}
      </Button>
    </>
  );
};

const Operations = () => {
  return (
    <div style={{ backgroundColor: 'white' }}>
      <Divider orientation="center">Operations</Divider>
      <Row gutter={[16, 24]}>
        <Col span={8}>
          <CustomButton func="readLockTime">Read Lock Time</CustomButton>
        </Col>
        <Col span={8}>
          <CustomButton func="unlock">Unlock</CustomButton>
        </Col>
        <Col span={8}>
          <CustomButton func="lock">Lock</CustomButton>
        </Col>
        <Col span={8}>
          <AddCyclicCodeButton>Add Cyclic Code</AddCyclicCodeButton>
        </Col>
      </Row>
    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Main />} />
      </Routes>
    </Router>
  );
}
