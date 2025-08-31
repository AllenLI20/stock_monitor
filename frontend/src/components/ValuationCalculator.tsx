import React, { useState } from 'react';
import { Form, InputNumber, Button, Card, Row, Col, Divider, Alert, Result, Space } from 'antd';
import { CalculatorOutlined, InfoCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

interface ValuationResult {
  eps: number | null;
  retention_ratio: number | null;
  dividend_ratio: number | null;
  dividend_per_share: number | null;
  theoretical_price: number | null;
  pe_ratio: number | null;
  error?: string;
}

const ValuationCalculator: React.FC = () => {
  const [form] = Form.useForm();
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      // 转换百分比为小数
      const data = {
        book_value_per_share: values.book_value_per_share,
        roe: values.roe / 100,
        perpetual_growth_rate: values.perpetual_growth_rate / 100,
        required_return_rate: values.required_return_rate / 100
      };

      const response = await axios.post('/stock_api/valuation/calculate', data);
      setResult(response.data);
    } catch (error: any) {
      setResult({
        eps: null,
        retention_ratio: null,
        dividend_ratio: null,
        dividend_per_share: null,
        theoretical_price: null,
        pe_ratio: null,
        error: error.response?.data?.detail || '计算失败'
      });
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    form.resetFields();
    setResult(null);
  };

  const onFillExample = () => {
    // 填入Excel表格中的示例数据
    form.setFieldsValue({
      book_value_per_share: 133.1,
      roe: 25,
      perpetual_growth_rate: 3,
      required_return_rate: 10
    });
  };

  return (
    <div className="container">
      <div className="header">
        <h1>股票估值计算器</h1>
        <p>基于戈登增长模型计算合理市盈率和理论股价</p>
      </div>

      <Card title="估值计算" className="card">
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            perpetual_growth_rate: 3,
            required_return_rate: 10
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="book_value_per_share"
                label="每股净资产 (元)"
                rules={[{ required: true, message: '请输入每股净资产' }]}
                help="公司每股对应的净资产价值"
              >
                <InputNumber
                  placeholder="例如：133.1"
                  min={0}
                  step={0.01}
                  style={{ width: '100%' }}
                  formatter={(value) => `¥${value}`}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="roe"
                label="ROE (%) (净资产收益率)"
                rules={[{ required: true, message: '请输入ROE' }]}
                help="净资产收益率，反映公司利用净资产创造利润的能力"
              >
                <InputNumber
                  placeholder="例如：25 (25%)"
                  min={0}
                  max={100}
                  step={0.1}
                  style={{ width: '100%' }}
                  formatter={(value) => `${value}%`}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="perpetual_growth_rate"
                label="永续增长率 (%)"
                rules={[{ required: true, message: '请输入永续增长率' }]}
                help="公司预期能长期保持的稳定增长率"
              >
                <InputNumber
                  placeholder="例如：3 (3%)"
                  min={0}
                  max={20}
                  step={0.1}
                  style={{ width: '100%' }}
                  formatter={(value) => `${value}%`}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="required_return_rate"
                label="要求回报率 (%)"
                rules={[{ required: true, message: '请输入要求回报率' }]}
                help="投资者投资该股票所期望的最低回报率"
              >
                <InputNumber
                  placeholder="例如：10 (10%)"
                  min={0}
                  max={100}
                  step={0.1}
                  style={{ width: '100%' }}
                  formatter={(value) => `${value}%`}
                />
              </Form.Item>
            </Col>
          </Row>

          <div className="button-group">
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<CalculatorOutlined />}
              style={{
                boxShadow: '0 4px 12px rgba(96, 125, 139, 0.2)', // 柔和的蓝灰色阴影
                backgroundColor: '#607d8b', // 柔和的蓝灰色背景
                borderColor: '#607d8b', // 柔和的蓝灰色边框
              }}
            >
              计算估值
            </Button>
            <Button
              onClick={onReset}
              style={{
                border: '1px solid #90a4ae', // 柔和的蓝灰色边框
                color: '#607d8b', // 柔和的蓝灰色文本
                background: '#eceff1', // 柔和的浅灰色背景
              }}
            >
              重置
            </Button>
            <Button
              onClick={onFillExample}
              style={{
                border: '1px solid #ffca28', // 柔和的黄色边框
                color: '#ffca28', // 柔和的黄色文本
                background: '#fffde7', // 柔和的浅黄色背景
              }}
            >
              填入示例数据
            </Button>
          </div>
        </Form>
      </Card>

      {/* 将估值说明卡片移动到最下方 */}
      <Alert
        message="估值计算说明及核心公式"
        description={
          <>
            <p><strong>计算说明：</strong></p>
            <p>基于Excel表格的戈登增长模型：EPS = 每股净资产 × ROE，利润留存率 = 永续增长率 / ROE，分红率 = 1 - 利润留存率，每股分红 = EPS × 分红率，内在价值 = 每股分红 / (要求回报率 - 永续增长率)，合理市盈率 = 内在价值 / EPS。</p>
            <br />
            <p><strong>核心计算公式：</strong></p>
            <p>EPS (每股收益) = 每股净资产 × ROE</p>
            <p>利润留存率 = 永续增长率 / ROE</p>
            <p>分红率 = 1 - 利润留存率</p>
            <p>每股分红 = EPS × 分红率</p>
            <p>内在价值 (理论股价) = 每股分红 / (要求回报率 - 永续增长率)</p>
            <p>合理市盈率 = 内在价值 / EPS</p>
          </>
        }
        type="info"
        showIcon
        className="ant-alert-custom-info" // 添加自定义类名
        style={{ marginBottom: 24, marginTop: 24 }} // 增加上下边距
      />
    </div>
  );
};

export default ValuationCalculator;
